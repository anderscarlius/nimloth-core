// Läsvägen — utökad för S2 (B4 Etapp 2, Grind 1 fynd i, del 1).
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
}

function fromLegacy(note: LegacyNote): MergedNote {
  return { ...note, source: "legacy" };
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
  try {
    legacyNotes = (await legacyClient.getNotesByPatient(patientNo)).map(fromLegacy);
  } catch {
    // legacy helt nere (inte "posten finns inte") — degradera, krascha inte.
    legacyUnavailable = true;
  }
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
  if (legacyNote) return fromLegacy(legacyNote);

  const pending = await fetchPendingShadowNoteById(pool, id);
  if (pending) return pending;

  // Genuint okänt om posten finns i legacy eller ej — legacy gick inte
  // att fråga, och den finns inte i den skuggade väntlistan. Att svara
  // 404 här vore att påstå "finns inte" när sanningen är "vet inte".
  if (legacyUnavailable) throw new LegacyUnavailableError();
  return undefined;
}
