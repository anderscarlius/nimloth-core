// S1 — skuggskrivning. Legacy skrivs FÖRST och är auktoritativ (Spec B4
// §3): om legacy-skrivningen fallerar avbryts hela operationen. Om
// legacy lyckas men EHRbase-skuggningen fallerar: felet loggas
// (shadow_write_log) och auditeras, men klienten får ändå framgång —
// en trasig skugga får inte blockera det kliniska arbetet. Detta är en
// medveten avvägning, inte ett förbiseende (Grind 1, punkt e).
//
// S2 (B4 Etapp 2) — samma regel speglad: Nimloth skrivs FÖRST och är
// auktoritativ, legacy skuggas best-effort via attemptReverseShadowWrite.
// En trasig omvänd skugga blockerar inte klienten, men den ÄR en skuld
// mot en framtida S2→S3-återgång (se shadow-debt.ts).

import type pg from "pg";
import type { LegacyClient, LegacyNote } from "./legacy-client.js";
import type { OpenEhrClient } from "./openehr-client.js";
import type { GatewayAuditPublisher } from "./audit.js";
import { getDirection, type RoutingDirection } from "./routing.js";
import { lookupEhrIdByPatientNo } from "./identity.js";

export type ShadowStatus = "SUCCESS" | "FAILED" | "SKIPPED_ALREADY_ATTEMPTED";

export interface ShadowResult {
  status: ShadowStatus;
  compositionUid?: string;
  errorDetail?: string;
}

export interface ReverseShadowResult {
  status: ShadowStatus;
  legacyNoteId?: string;
  errorDetail?: string;
}

export interface NimlothNote {
  id: string; // vo_id — se reverse_shadow_write_log-migrationen för resonemanget.
  compositionUid: string;
  ehrId: string;
  text: string;
  createdAt: string;
}

export interface WriteNoteResult {
  direction: RoutingDirection;
  legacyNote?: LegacyNote;
  nimlothNote?: NimlothNote;
  shadow: ShadowResult | null;
  reverseShadow: ReverseShadowResult | null;
}

// Grind 1-amendemang (2026-08-27, punkt 1): author_sign i legacy betyder
// "den här personen skrev det" i en journalhandling — det får aldrig
// ersättas med en systemsignatur som ser ut som en riktig persons
// initialer. När Nimloth är författare och skuggar till legacy finns
// ingen tillförlitlig mappning till legacy:s fyrteckensformat (inget
// HSA/SITHS-baserat identitetslager är byggt än, Block 1). Valet är
// därför INGEN mappning: en sentinel som ingen människa kan förväxla med
// riktiga initialer (jmf. "ANCA", "BSVN" i seed-datat). Förlustliggaren
// (loss-ledger.ts) registrerar detta explicit som "författare ej
// rekonstruerbar", inte som en lossy men ändå meningsfull konvertering.
export const REVERSE_SHADOW_SENTINEL_AUTHOR_SIGN = "----";

async function setProvenance(pool: pg.Pool, logicalNoteId: string, canonicalStore: "legacy" | "openehr"): Promise<void> {
  await pool.query(
    `INSERT INTO note_provenance (logical_note_id, canonical_store)
     VALUES ($1, $2)
     ON CONFLICT (logical_note_id) DO UPDATE SET canonical_store = EXCLUDED.canonical_store, set_at = NOW()`,
    [logicalNoteId, canonicalStore],
  );
}

// I4 — idempotent: säkert att kalla om för samma legacy-post. En redan
// loggad rad (SUCCESS eller FAILED) hoppas över i stället för att skriva
// en andra composition eller skriva över felloggen.
export async function attemptShadowWrite(
  pool: pg.Pool,
  openEhrClient: OpenEhrClient,
  audit: GatewayAuditPublisher,
  legacyNote: LegacyNote,
  ehrId: string,
): Promise<ShadowResult> {
  const existing = await pool.query(
    `SELECT status, composition_uid, error_detail FROM shadow_write_log WHERE legacy_note_id = $1`,
    [legacyNote.id],
  );
  if (existing.rows.length > 0) {
    return {
      status: "SKIPPED_ALREADY_ATTEMPTED",
      compositionUid: existing.rows[0].composition_uid ?? undefined,
      errorDetail: existing.rows[0].error_detail ?? undefined,
    };
  }

  try {
    const { compositionUid } = await openEhrClient.writeProgressNote({
      ehrId,
      text: legacyNote.text,
      composerName: legacyNote.author_sign,
      // legacy_sim:s created_at är lokal tid utan zon — tolkas som
      // Europe/Stockholm vid överföring till EHRbase (som kräver zon).
      // Se B4_Etapp1-rapportens fältklassning: detta ÄR representerbart,
      // bara omtolkat, inte förlorat.
      timestampIso: new Date(`${legacyNote.created_at.replace(" ", "T")}+02:00`).toISOString(),
    });
    await pool.query(
      `INSERT INTO shadow_write_log (legacy_note_id, ehr_id, status, composition_uid)
       VALUES ($1, $2, 'SUCCESS', $3)`,
      [legacyNote.id, ehrId, compositionUid],
    );
    await audit.emit("SHADOW_WRITE_SUCCESS", {
      resourceType: "Note",
      resourceId: legacyNote.id,
      canonicalStore: "legacy",
      details: { compositionUid, ehrId },
    });
    return { status: "SUCCESS", compositionUid };
  } catch (err) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    await pool.query(
      `INSERT INTO shadow_write_log (legacy_note_id, ehr_id, status, error_detail)
       VALUES ($1, $2, 'FAILED', $3)`,
      [legacyNote.id, ehrId, errorDetail],
    );
    await audit.emit("SHADOW_WRITE_FAILED", {
      resourceType: "Note",
      resourceId: legacyNote.id,
      canonicalStore: "legacy",
      outcome: "ERROR",
      details: { errorDetail, ehrId },
    });
    return { status: "FAILED", errorDetail };
  }
}

// I4, spegelvänd — idempotent: säkert att kalla om för samma composition.
// Kollar loggen FÖRE varje legacy-anrop, oavsett om den underliggande
// legacy-raden (om den finns) hunnit signeras sedan förra försöket (I1,
// Grind 1 punkt h) — det finns aldrig ett andra anrop som skulle kunna
// träffa en signerad rad, för det finns aldrig ett andra anrop alls.
export async function attemptReverseShadowWrite(
  pool: pg.Pool,
  legacyClient: LegacyClient,
  audit: GatewayAuditPublisher,
  note: {
    compositionUid: string;
    voId: string;
    ehrId: string;
    patientNo: string;
    careUnit: string;
    text: string;
    noteCreatedAt: string;
  },
): Promise<ReverseShadowResult> {
  const existing = await pool.query(
    `SELECT status, legacy_note_id, error_detail FROM reverse_shadow_write_log WHERE composition_uid = $1`,
    [note.compositionUid],
  );
  if (existing.rows.length > 0) {
    return {
      status: "SKIPPED_ALREADY_ATTEMPTED",
      legacyNoteId: existing.rows[0].legacy_note_id ?? undefined,
      errorDetail: existing.rows[0].error_detail ?? undefined,
    };
  }

  const startedAt = Date.now();
  try {
    const legacyNote = await legacyClient.createNote({
      patient_no: note.patientNo,
      care_unit: note.careUnit,
      text: note.text,
      author_sign: REVERSE_SHADOW_SENTINEL_AUTHOR_SIGN,
    });
    const durationMs = Date.now() - startedAt;
    await pool.query(
      `INSERT INTO reverse_shadow_write_log
         (composition_uid, vo_id, ehr_id, patient_no, care_unit, note_text, note_created_at, legacy_note_id, status, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUCCESS', $9)`,
      [note.compositionUid, note.voId, note.ehrId, note.patientNo, note.careUnit, note.text, note.noteCreatedAt, legacyNote.id, durationMs],
    );
    await audit.emit("REVERSE_SHADOW_WRITE_SUCCESS", {
      resourceType: "Note",
      resourceId: note.voId,
      canonicalStore: "openehr",
      details: { legacyNoteId: legacyNote.id, ehrId: note.ehrId, durationMs },
    });
    return { status: "SUCCESS", legacyNoteId: legacyNote.id };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorDetail = err instanceof Error ? err.message : String(err);
    await pool.query(
      `INSERT INTO reverse_shadow_write_log
         (composition_uid, vo_id, ehr_id, patient_no, care_unit, note_text, note_created_at, status, error_detail, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'FAILED', $8, $9)`,
      [note.compositionUid, note.voId, note.ehrId, note.patientNo, note.careUnit, note.text, note.noteCreatedAt, errorDetail, durationMs],
    );
    await audit.emit("REVERSE_SHADOW_WRITE_FAILED", {
      resourceType: "Note",
      resourceId: note.voId,
      canonicalStore: "openehr",
      outcome: "ERROR",
      details: { errorDetail, ehrId: note.ehrId, durationMs },
    });
    return { status: "FAILED", errorDetail };
  }
}

export async function writeNote(
  pool: pg.Pool,
  legacyClient: LegacyClient,
  openEhrClient: OpenEhrClient,
  audit: GatewayAuditPublisher,
  params: {
    domain: string;
    patientNo: string;
    careUnit: string;
    text: string;
    authorSign: string;
    composerName?: string;
  },
): Promise<WriteNoteResult> {
  const direction = await getDirection(pool, params.domain, params.careUnit);

  // I5: SHADOW och NIMLOTH kräver båda en identitetsmappning. Ingen tyst
  // fallback till LEGACY_ONLY om den saknas — det vore precis den tysta
  // felkälla spec:en varnar för. Felar högt, före någon skrivning alls.
  let ehrId: string | undefined;
  if (direction === "SHADOW" || direction === "NIMLOTH") {
    ehrId = await lookupEhrIdByPatientNo(pool, params.patientNo);
  }

  if (direction === "NIMLOTH") {
    const timestampIso = new Date().toISOString();
    const { compositionUid } = await openEhrClient.writeProgressNote({
      ehrId: ehrId as string,
      text: params.text,
      composerName: params.composerName ?? params.authorSign,
      timestampIso,
    });
    const voId = compositionUid.split("::")[0];
    await setProvenance(pool, voId, "openehr");

    const reverseShadow = await attemptReverseShadowWrite(pool, legacyClient, audit, {
      compositionUid,
      voId,
      ehrId: ehrId as string,
      patientNo: params.patientNo,
      careUnit: params.careUnit,
      text: params.text,
      noteCreatedAt: timestampIso,
    });

    return {
      direction,
      nimlothNote: { id: voId, compositionUid, ehrId: ehrId as string, text: params.text, createdAt: timestampIso },
      shadow: null,
      reverseShadow,
    };
  }

  const legacyNote = await legacyClient.createNote({
    patient_no: params.patientNo,
    care_unit: params.careUnit,
    text: params.text,
    author_sign: params.authorSign,
  });

  await setProvenance(pool, legacyNote.id, "legacy");

  if (direction === "LEGACY_ONLY") {
    return { direction, legacyNote, shadow: null, reverseShadow: null };
  }

  const shadow = await attemptShadowWrite(pool, openEhrClient, audit, legacyNote, ehrId as string);
  return { direction, legacyNote, shadow, reverseShadow: null };
}
