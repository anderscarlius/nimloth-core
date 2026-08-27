// B4 Etapp 1 — paritetsdiffens första skarpa fall (Spec B4 §7: "B4 ger
// den det skarpa case den saknat"). Fas A-fyndet (P3.4-DAY-0-BASELINE.md)
// visade att den befintliga paritetsrunnern aldrig sett en genuin
// tvåsidig avvikelse — bara trivial 0-mot-N eftersom materializern
// aldrig körts.
//
// ARKITEKTURELL AVVIKELSE FRÅN GRIND 1, TRANSPARENT REDOVISAD: designen
// i grind 1 föreslog "en ny jämförelsefunktion i samma parity/-modul".
// Den befintliga runner.ts/diff.ts är hårt kopplad mot antagandet att
// BÅDA sidor implementerar FhirStore-interfacet (postgres vs openehr,
// samma typade uppslagsmetoder). nimloth-legacy-sim är inte en FhirStore
// — det är en REST-tjänst i ett helt annat repo, med en helt annan
// resursform. Att tvinga in den jämförelsen i den generiska
// runner-loopen hade krävt att omarbeta dess kärnantagande, en
// betydligt större ändring än vad grind 1 avsåg. Denna fil ligger i
// SAMMA modul (samma katalog) men är en fristående jämförelsefunktion,
// inte inbakad i den generiska diffResources()-loopen. Se
// B4_Etapp1_Legacysim_och_Skuggning_2026-08-19.md för fullständigt
// resonemang.
//
// Grind 1-amendemang (2026-08-19, punkt 3): konsulterar
// migration-gateway:s shadow_write_log för att skilja "kom aldrig fram"
// (FAILED, eller ingen rad alls — se LEGACY_ONLY_NOT_SHADOWED) från
// "kom fram och skiljer sig" (SUCCESS men innehållet ändå avviker).

import type pg from "pg";

export type AnteckningClassification =
  | "LEGACY_ONLY_NOT_SHADOWED"
  | "SHADOW_FAILED"
  | "SHADOW_SUCCESS_MATCH"
  | "SHADOW_SUCCESS_MISMATCH";

export interface AnteckningDiffRow {
  legacyNoteId: string;
  classification: AnteckningClassification;
  legacyText: string;
  openEhrText: string | null;
  compositionUid: string | null;
  errorDetail: string | null;
}

export interface AnteckningDiffResult {
  patientNo: string;
  ehrId: string;
  totalLegacyNotes: number;
  rows: AnteckningDiffRow[];
  summary: Record<AnteckningClassification, number>;
}

interface LegacyNote {
  id: string;
  text: string;
}

interface ShadowLogRow {
  legacy_note_id: string;
  status: "SUCCESS" | "FAILED";
  composition_uid: string | null;
  error_detail: string | null;
}

async function fetchLegacyNotes(legacySimBaseUrl: string, patientNo: string): Promise<LegacyNote[]> {
  const resp = await fetch(`${legacySimBaseUrl}/notes/by-patient/${encodeURIComponent(patientNo)}`);
  return (await resp.json()) as LegacyNote[];
}

async function fetchShadowLog(gatewayPool: pg.Pool, legacyNoteIds: string[]): Promise<Map<string, ShadowLogRow>> {
  if (legacyNoteIds.length === 0) return new Map();
  const result = await gatewayPool.query(
    `SELECT legacy_note_id, status, composition_uid, error_detail
     FROM shadow_write_log WHERE legacy_note_id = ANY($1::uuid[])`,
    [legacyNoteIds],
  );
  return new Map(result.rows.map((row: ShadowLogRow) => [row.legacy_note_id, row]));
}

async function fetchCompositionText(ehrbaseBaseUrl: string, ehrId: string, compositionUid: string): Promise<string | null> {
  const aql = {
    q: `SELECT o/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value AS note_text
        FROM EHR e[ehr_id/value='${ehrId}'] CONTAINS COMPOSITION c[uid/value='${compositionUid}']
        CONTAINS OBSERVATION o[openEHR-EHR-OBSERVATION.progress_note.v1]`,
  };
  const resp = await fetch(`${ehrbaseBaseUrl}/rest/openehr/v1/query/aql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(aql),
  });
  if (!resp.ok) return null;
  const body = (await resp.json()) as { rows: string[][] };
  return body.rows[0]?.[0] ?? null;
}

export async function diffAnteckningForPatient(
  deps: { legacySimBaseUrl: string; ehrbaseBaseUrl: string; gatewayPool: pg.Pool },
  patientNo: string,
  ehrId: string,
): Promise<AnteckningDiffResult> {
  const legacyNotes = await fetchLegacyNotes(deps.legacySimBaseUrl, patientNo);
  const shadowLog = await fetchShadowLog(deps.gatewayPool, legacyNotes.map((n) => n.id));

  const summary: Record<AnteckningClassification, number> = {
    LEGACY_ONLY_NOT_SHADOWED: 0,
    SHADOW_FAILED: 0,
    SHADOW_SUCCESS_MATCH: 0,
    SHADOW_SUCCESS_MISMATCH: 0,
  };

  const rows: AnteckningDiffRow[] = [];
  for (const note of legacyNotes) {
    const logRow = shadowLog.get(note.id);

    if (!logRow) {
      // Förenkling denna etapp: ingen rad i shadow_write_log tolkas som
      // "routing var LEGACY_ONLY när posten skrevs, ingen skuggning
      // försöktes" — inte som en avvikelse. Håller inte om en post
      // skrevs under SHADOW men shadow_write_log-raden gått förlorad av
      // annan anledning (skulle i så fall se likadan ut). Flaggat, inte
      // löst, i B4_Etapp1-rapporten.
      summary.LEGACY_ONLY_NOT_SHADOWED++;
      rows.push({
        legacyNoteId: note.id,
        classification: "LEGACY_ONLY_NOT_SHADOWED",
        legacyText: note.text,
        openEhrText: null,
        compositionUid: null,
        errorDetail: null,
      });
      continue;
    }

    if (logRow.status === "FAILED") {
      summary.SHADOW_FAILED++;
      rows.push({
        legacyNoteId: note.id,
        classification: "SHADOW_FAILED",
        legacyText: note.text,
        openEhrText: null,
        compositionUid: null,
        errorDetail: logRow.error_detail,
      });
      continue;
    }

    const openEhrText = logRow.composition_uid
      ? await fetchCompositionText(deps.ehrbaseBaseUrl, ehrId, logRow.composition_uid)
      : null;
    const matches = openEhrText === note.text;
    summary[matches ? "SHADOW_SUCCESS_MATCH" : "SHADOW_SUCCESS_MISMATCH"]++;
    rows.push({
      legacyNoteId: note.id,
      classification: matches ? "SHADOW_SUCCESS_MATCH" : "SHADOW_SUCCESS_MISMATCH",
      legacyText: note.text,
      openEhrText,
      compositionUid: logRow.composition_uid,
      errorDetail: null,
    });
  }

  return { patientNo, ehrId, totalLegacyNotes: legacyNotes.length, rows, summary };
}

// B4 Etapp 2 — spegelbilden av ovan för S2 (Nimloth auktoritativ, legacy
// skuggas). Samma modulgräns-argument som Etapp 1 (se filens header):
// diffAnteckningForPatient itererar FRÅN legacy, vilket är rätt för
// S0/S1 men ofullständigt för S2 — en Nimloth-född anteckning vars
// omvända skuggskrivning fallerat skulle aldrig upptäckas av en
// legacy-driven loop, eftersom den inte finns i legacy alls än. Denna
// funktion itererar i stället FRÅN reverse_shadow_write_log (gatewayens
// facit över vad Nimloth skrivit), inte från en generaliserad
// N-riktningsloop (S7 — ingen verktygslåda, en sibling-funktion räcker).
//
// note_text i reverse_shadow_write_log är denormaliserad vid
// skrivtillfället (se migration-gatewayens migrations/006-kommentar) —
// ingen AQL-läsning behövs här, bara en jämförelse mot legacy:s aktuella
// text för SUCCESS-poster.

export type NimlothOriginClassification =
  | "NIMLOTH_ONLY_NOT_SHADOWED"
  | "REVERSE_SHADOW_SUCCESS_MATCH"
  | "REVERSE_SHADOW_SUCCESS_MISMATCH";

export interface NimlothOriginDiffRow {
  voId: string;
  classification: NimlothOriginClassification;
  nimlothText: string;
  legacyText: string | null;
  legacyNoteId: string | null;
}

export interface NimlothOriginDiffResult {
  ehrId: string;
  totalNimlothNotes: number;
  rows: NimlothOriginDiffRow[];
  summary: Record<NimlothOriginClassification, number>;
}

interface ReverseShadowLogRow {
  vo_id: string;
  note_text: string;
  legacy_note_id: string | null;
  status: "SUCCESS" | "FAILED";
}

async function fetchLegacyNoteText(legacySimBaseUrl: string, legacyNoteId: string): Promise<string | null> {
  const resp = await fetch(`${legacySimBaseUrl}/notes/${encodeURIComponent(legacyNoteId)}`);
  if (resp.status === 404) return null;
  const body = (await resp.json()) as { text: string };
  return body.text;
}

export async function diffNimlothOriginatedForEhr(
  deps: { legacySimBaseUrl: string; gatewayPool: pg.Pool },
  ehrId: string,
): Promise<NimlothOriginDiffResult> {
  const logRows = await deps.gatewayPool.query(
    `SELECT vo_id, note_text, legacy_note_id, status FROM reverse_shadow_write_log WHERE ehr_id = $1`,
    [ehrId],
  );
  const rowsData = logRows.rows as ReverseShadowLogRow[];

  const summary: Record<NimlothOriginClassification, number> = {
    NIMLOTH_ONLY_NOT_SHADOWED: 0,
    REVERSE_SHADOW_SUCCESS_MATCH: 0,
    REVERSE_SHADOW_SUCCESS_MISMATCH: 0,
  };

  const rows: NimlothOriginDiffRow[] = [];
  for (const logRow of rowsData) {
    if (logRow.status === "FAILED") {
      summary.NIMLOTH_ONLY_NOT_SHADOWED++;
      rows.push({
        voId: logRow.vo_id,
        classification: "NIMLOTH_ONLY_NOT_SHADOWED",
        nimlothText: logRow.note_text,
        legacyText: null,
        legacyNoteId: null,
      });
      continue;
    }

    const legacyText = await fetchLegacyNoteText(deps.legacySimBaseUrl, logRow.legacy_note_id as string);
    const matches = legacyText === logRow.note_text;
    summary[matches ? "REVERSE_SHADOW_SUCCESS_MATCH" : "REVERSE_SHADOW_SUCCESS_MISMATCH"]++;
    rows.push({
      voId: logRow.vo_id,
      classification: matches ? "REVERSE_SHADOW_SUCCESS_MATCH" : "REVERSE_SHADOW_SUCCESS_MISMATCH",
      nimlothText: logRow.note_text,
      legacyText,
      legacyNoteId: logRow.legacy_note_id,
    });
  }

  return { ehrId, totalNimlothNotes: rowsData.length, rows, summary };
}
