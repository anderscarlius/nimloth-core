// S1 — skuggskrivning. Legacy skrivs FÖRST och är auktoritativ (Spec B4
// §3): om legacy-skrivningen fallerar avbryts hela operationen. Om
// legacy lyckas men EHRbase-skuggningen fallerar: felet loggas
// (shadow_write_log) och auditeras, men klienten får ändå framgång —
// en trasig skugga får inte blockera det kliniska arbetet. Detta är en
// medveten avvägning, inte ett förbiseende (Grind 1, punkt e).

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

export interface WriteNoteResult {
  direction: RoutingDirection;
  legacyNote: LegacyNote;
  shadow: ShadowResult | null;
}

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
  },
): Promise<WriteNoteResult> {
  const direction = await getDirection(pool, params.domain, params.careUnit);

  // I5: SHADOW kräver en identitetsmappning. Ingen tyst fallback till
  // LEGACY_ONLY om den saknas — det vore precis den tysta felkälla
  // spec:en varnar för. Felar högt, före legacy-skrivningen.
  let ehrId: string | undefined;
  if (direction === "SHADOW") {
    ehrId = await lookupEhrIdByPatientNo(pool, params.patientNo);
  }

  const legacyNote = await legacyClient.createNote({
    patient_no: params.patientNo,
    care_unit: params.careUnit,
    text: params.text,
    author_sign: params.authorSign,
  });

  await setProvenance(pool, legacyNote.id, "legacy");

  if (direction === "LEGACY_ONLY") {
    return { direction, legacyNote, shadow: null };
  }

  const shadow = await attemptShadowWrite(pool, openEhrClient, audit, legacyNote, ehrId as string);
  return { direction, legacyNote, shadow };
}
