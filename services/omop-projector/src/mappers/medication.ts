// medication_summary.v1 → omop.drug_exposure
//
// Tolerans (per Del 0-rapport):
//   - ATC-kod accepteras i drug_source_value. drug_concept_id sätts till 0
//     (RxNorm-mapping är ej i scope för Del 1).
//   - drug_exposure_start_date kommer från composition.context.start_time
//     (B14/SDG-09 Path B fixade ctx/time i FLAT input — kolumnen är tillförlitlig).
//   - Fri-text-beskrivningen lagras i sig.
//
// Lineage: composition_uid + arketyp-id + transform-version stämplas per rad.
// INGEN LLM.

import type { DrugExposureRow, Degradation } from '../types.js';

const ARCHETYPE = 'openEHR-EHR-EVALUATION.medication_summary.v1';

export interface MedAqlRow {
  composition_uid: string;
  context_start_time: string | null;     // c/context/start_time/value
  archetype_start_date: string | null;   // at0006 — föredragen om satt
  medication_text: string;
  atc_code: string | null;
}

export interface MedMapResult {
  rows: DrugExposureRow[];
  degradations: Degradation[];
}

/**
 * Tar råa AQL-rader (5 kolumner i ordningen från aqlMedicationSummary)
 * och returnerar drug_exposure-rader + ev. degraderings-anteckningar.
 *
 * Kolumn-ordning (KU Steg 1):
 *   [0] composition_uid             c/uid/value
 *   [1] context_start_time          c/context/start_time/value
 *   [2] archetype_start_date        m/data[at0001]/items[at0006]/value/value
 *   [3] medication_text             m/data[at0001]/items[at0002]/value/value
 *   [4] atc_code                    m/data[at0001]/items[at0003]/value/defining_code/code_string
 *
 * Vi prefer:ar arketyp-intern start_date där den finns (klinisk-tidpunkt),
 * och fall:ar tillbaka på composition-context.start_time. Aldrig commit-tid.
 */
export function mapMedicationSummaryRows(
  patientSourceValue: string,
  aqlRows: unknown[][],
): MedMapResult {
  const rows: DrugExposureRow[] = [];
  const degradations: Degradation[] = [];

  for (const r of aqlRows) {
    const [compUid, contextStart, archetypeStart, text, atc] = r as [
      string,
      string | null,
      string | null,
      string,
      string | null,
    ];

    // Välj klinisk start_date — at0006 om satt, annars composition-context.
    const startTime =
      typeof archetypeStart === 'string' && archetypeStart.length > 0
        ? archetypeStart
        : typeof contextStart === 'string' && contextStart.length > 0
          ? contextStart
          : null;

    if (!compUid || !startTime) {
      // EHRbase ska aldrig leverera detta — defensiv check.
      degradations.push({
        kind: 'missing_field',
        source_archetype: ARCHETYPE,
        source_field: 'composition_uid|start_time',
        source_value: null,
        reason: 'AQL returnerade tom composition_uid eller start_time — raden hoppas',
      });
      continue;
    }

    const startIso = normalizeIsoDatetime(startTime);
    const startDate = startIso.slice(0, 10);

    const atcTrimmed = atc?.trim() || null;
    if (!atcTrimmed) {
      // ATC saknas — vi degraderar ändå (lagrar fri-text i sig, drug_source_value=null).
      degradations.push({
        kind: 'missing_field',
        source_archetype: ARCHETYPE,
        source_field: 'atc_code',
        source_value: null,
        reason: 'ATC-kod saknas i medication_summary — endast fri-text bevaras',
        composition_uid: compUid,
      });
    } else {
      // ATC finns men RxNorm-mapping är ej i scope — degradera target-concept.
      degradations.push({
        kind: 'missing_target_concept',
        source_archetype: ARCHETYPE,
        source_field: 'atc_code',
        source_value: atcTrimmed,
        reason: 'ATC bevaras i drug_source_value; RxNorm-mapping ej i Del 1 → drug_concept_id=0',
        composition_uid: compUid,
      });
    }

    rows.push({
      person_source_value: patientSourceValue,
      drug_exposure_start_date: startDate,
      drug_exposure_start_datetime: startIso,
      drug_source_value: atcTrimmed,
      sig: text?.trim() || null,
      _source_composition_uid: compUid,
      _source_archetype: ARCHETYPE,
    });
  }

  return { rows, degradations };
}

/** Säkerställ ISO 8601 med 'Z' om EHRbase ger oss naken offset. */
function normalizeIsoDatetime(s: string): string {
  // EHRbase returnerar typiskt 2024-11-15T08:00:00Z eller med +00:00.
  // Postgres TIMESTAMPTZ klarar bägge — vi normaliserar inte här.
  return s;
}
