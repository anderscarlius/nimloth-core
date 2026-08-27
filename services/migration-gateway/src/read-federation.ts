// Läsvägen — utökad för S2 (B4 Etapp 2, Grind 1 fynd i, del 1) och för
// S3 (B4 Etapp 3, Grind 1 punkt f).
//
// G1 (Etapp 1): live läsfederation mot legacy, inte logg-baserad CDC.
// I S0/S1 räckte det att läsa legacy rakt av — legacy förblir en
// fullständig spegel så länge skuggningen fungerar. I S2 håller det INTE
// längre: om en omvänd skuggskrivning fallerar finns den Nimloth-födda
// anteckningen ÄNNU INTE i legacy alls (inte bara med avvikande
// innehåll — helt frånvarande). En ren legacy-läsning skulle tyst
// utelämna den, vilket bryter A5 ("samma anteckning läsbar... i samma
// vy"). Denna fil slår ihop legacy:s lista med FAILED-poster ur
// reverse_shadow_write_log (identifierade via vo_id, källa: samma tabell
// som redan bär texten denormaliserad — se dess migrations-kommentar).
//
// S3-tillägget (Grind 1 punkt f, beslut med motivering): efter en
// återgång till LEGACY_ONLY är legacy återigen auktoritativt — vyn ska
// visa legacy:s innehåll, inte tyst servera Nimloths rikare version
// (det vore att låtsas att återgången inte hänt). Men en post som
// ursprungligen skrevs under NIMLOTH-auktoritet (note_provenance =
// 'openehr') och lyckades reverse-skuggas bär en LOSSY projektion i
// legacy. Att visa den utan markering vore att tyst servera den
// fattigare versionen — det uttryckliga förbudet i insikt 4. Varje
// sådan post annoteras därför med richer_version_available + en
// pekare mot exportpaketets manifestpost (compositionUid).

import type pg from "pg";
import type { LegacyClient, LegacyNote } from "./legacy-client.js";
import { IdentityNotFoundError, lookupEhrIdByPatientNo } from "./identity.js";

export type MergedNoteSource = "legacy" | "openehr_pending_shadow";

export interface MergedNote {
  id: string;
  patient_no: string;
  care_unit: string;
  text: string;
  author_sign: string | null;
  created_at: string;
  signed_at: string | null;
  source: MergedNoteSource;
  richer_version_available: boolean;
  richer_version_ref: { composition_uid: string } | null;
}

interface RicherVersionRow {
  legacy_note_id: string;
  composition_uid: string;
}

async function fetchRicherVersionRefs(pool: pg.Pool, legacyNoteIds: string[]): Promise<Map<string, string>> {
  if (legacyNoteIds.length === 0) return new Map();
  // note_provenance styr VILKEN store som var auktoritativ när posten
  // skrevs, men bär inte compositionUid — den kopplingen finns bara i
  // reverse_shadow_write_log (legacy_note_id -> composition_uid, satt
  // vid SUCCESS). En join, inte två separata frågor att kombinera i
  // applikationskoden.
  const result = await pool.query(
    `SELECT r.legacy_note_id, r.composition_uid
     FROM reverse_shadow_write_log r
     JOIN note_provenance p ON p.logical_note_id = r.vo_id
     WHERE r.legacy_note_id = ANY($1::uuid[]) AND r.status = 'SUCCESS' AND p.canonical_store = 'openehr'`,
    [legacyNoteIds],
  );
  return new Map(result.rows.map((row: RicherVersionRow) => [row.legacy_note_id, row.composition_uid]));
}

function fromLegacy(note: LegacyNote, richerVersionCompositionUid: string | undefined): MergedNote {
  return {
    ...note,
    source: "legacy",
    richer_version_available: richerVersionCompositionUid !== undefined,
    richer_version_ref: richerVersionCompositionUid ? { composition_uid: richerVersionCompositionUid } : null,
  };
}

// Upptäckt live under Fas B steg 6 (medvetet framkallad SHADOW_FAILED):
// den ursprungliga implementationen antog att legacy:s klient bara kan
// 404:a på EN specifik post, och kraschade helt (okatchat fetch-fel) när
// legacy-sim var helt nere — exakt scenariot A5 är till för att täcka.
// Ett verkligt driftavbrott ska degradera läsvägen, inte krascha den.
export class LegacyUnavailableError extends Error {
  constructor() {
    super("legacy-sim är inte nåbar — kan inte bekräfta läget för denna post");
    this.name = "LegacyUnavailableError";
  }
}

// pg parsear TIMESTAMPTZ-kolumner till Date-objekt, medan legacy:s
// created_at (via legacy-sim:s TO_CHAR-formatering) redan är en sträng.
// Normalisera till ISO-strängar innan sortering — annars kraschar
// String.prototype.localeCompare på ett Date-objekt.
function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function fetchPendingShadowNotes(pool: pg.Pool, patientNo: string): Promise<MergedNote[]> {
  let ehrId: string;
  try {
    ehrId = await lookupEhrIdByPatientNo(pool, patientNo);
  } catch (err) {
    // Ingen identitetsmappning => inga möjliga NIMLOTH-skrivningar för
    // denna patient => inget att slå ihop. Inte ett fel i läsvägen.
    if (err instanceof IdentityNotFoundError) return [];
    throw err;
  }

  const result = await pool.query(
    `SELECT vo_id, care_unit, note_text, note_created_at
     FROM reverse_shadow_write_log
     WHERE ehr_id = $1 AND status = 'FAILED'`,
    [ehrId],
  );
  return result.rows.map((row) => ({
    id: row.vo_id,
    patient_no: patientNo,
    care_unit: row.care_unit,
    text: row.note_text,
    author_sign: null,
    created_at: toIsoString(row.note_created_at),
    signed_at: null,
    source: "openehr_pending_shadow" as const,
    // Den HÄR posten ÄR den rikare versionen (den bor bara i EHRbase än)
    // — ingen ytterligare pekare att erbjuda.
    richer_version_available: false,
    richer_version_ref: null,
  }));
}

export interface MergedNotesResult {
  notes: MergedNote[];
  legacyUnavailable: boolean;
}

export async function getNotesByPatientMerged(
  pool: pg.Pool,
  legacyClient: LegacyClient,
  patientNo: string,
): Promise<MergedNotesResult> {
  let legacyNotes: MergedNote[] = [];
  let legacyUnavailable = false;
  let rawLegacyNotes: LegacyNote[] = [];
  try {
    rawLegacyNotes = await legacyClient.getNotesByPatient(patientNo);
  } catch {
    // legacy helt nere (inte "posten finns inte") — degradera, krascha inte.
    legacyUnavailable = true;
  }
  // Utanför try/catch avsiktligt: ett fel HÄR är ett gateway-DB-fel, inte
  // ett legacy-otillgänglighetsfel — de ska inte rapporteras som samma sak.
  const richerRefs = await fetchRicherVersionRefs(pool, rawLegacyNotes.map((n) => n.id));
  legacyNotes = rawLegacyNotes.map((n) => fromLegacy(n, richerRefs.get(n.id)));
  const pending = await fetchPendingShadowNotes(pool, patientNo);
  const notes = [...legacyNotes, ...pending].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { notes, legacyUnavailable };
}

async function fetchPendingShadowNoteById(pool: pg.Pool, id: string): Promise<MergedNote | undefined> {
  const result = await pool.query(
    `SELECT vo_id, patient_no, care_unit, note_text, note_created_at
     FROM reverse_shadow_write_log
     WHERE vo_id = $1 AND status = 'FAILED'`,
    [id],
  );
  if (result.rows.length === 0) return undefined;
  const row = result.rows[0];
  return {
    id: row.vo_id,
    patient_no: row.patient_no,
    care_unit: row.care_unit,
    text: row.note_text,
    author_sign: null,
    created_at: toIsoString(row.note_created_at),
    signed_at: null,
    source: "openehr_pending_shadow",
    richer_version_available: false,
    richer_version_ref: null,
  };
}

export async function getNoteByIdMerged(
  pool: pg.Pool,
  legacyClient: LegacyClient,
  id: string,
): Promise<MergedNote | undefined> {
  let legacyNote: LegacyNote | undefined;
  let legacyUnavailable = false;
  try {
    legacyNote = await legacyClient.getNoteById(id);
  } catch {
    legacyUnavailable = true;
  }
  if (legacyNote) {
    const richerRefs = await fetchRicherVersionRefs(pool, [legacyNote.id]);
    return fromLegacy(legacyNote, richerRefs.get(legacyNote.id));
  }

  const pending = await fetchPendingShadowNoteById(pool, id);
  if (pending) return pending;

  // Genuint okänt om posten finns i legacy eller ej — legacy gick inte
  // att fråga, och den finns inte i den skuggade väntlistan. Att svara
  // 404 här vore att påstå "finns inte" när sanningen är "vet inte".
  if (legacyUnavailable) throw new LegacyUnavailableError();
  return undefined;
}
