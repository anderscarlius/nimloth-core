// Direkt AQL-klient mot EHRbase 2.30.1 REST v1.
//
// VARFÖR INTE aql-template-service?
// Mallarna `active_medications` och `observation_trend_by_period` saknar
// composition_uid + start_time i sin output — vi behöver dessa för lineage
// (B3 i Del 1). Tech debt: utöka mallarna när vi vill bygga klient-läsbara
// vyer ovanpå samma frågor.
//
// INGEN LLM, ingen tolkning — bara råa rader från EHRbase.

import type { Logger } from 'pino';

export interface AqlResult {
  rows: unknown[][];
  meta?: Record<string, unknown>;
}

export interface AqlClientOptions {
  baseUrl: string;
  timeoutMs: number;
  logger: Logger;
}

export class AqlClient {
  constructor(private readonly opts: AqlClientOptions) {}

  /**
   * Kör en AQL-fråga via /query/aql och returnera rows.
   * Kastar Error vid HTTP != 200 — uppströms beslutar om svältning.
   */
  async query(aql: string): Promise<AqlResult> {
    const url = `${this.opts.baseUrl}/rest/openehr/v1/query/aql`;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: aql }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        this.opts.logger.error({ status: res.status, text, aql }, 'AQL HTTP error');
        throw new Error(`AQL HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const body = (await res.json()) as { rows?: unknown[][]; meta?: Record<string, unknown> };
      return { rows: body.rows ?? [], meta: body.meta };
    } finally {
      clearTimeout(t);
    }
  }
}

// ============================================================
// Konkreta AQL:er som projektorn förlitar sig på.
// ============================================================

/** EHR-id + ehr_status.subject för en given patient. */
export function aqlEhrForPatient(patientId: string): string {
  // RETURN: ehr_id, subject_id
  return `SELECT e/ehr_id/value, e/ehr_status/subject/external_ref/id/value FROM EHR e WHERE e/ehr_status/subject/external_ref/id/value = '${escape(patientId)}'`;
}

/**
 * medication_summary.v1 — en rad per EVALUATION.
 * Kolumner: composition_uid, context_start_time, archetype_start_date,
 *           medication_text, atc_code
 *
 * KU Steg 1: Vi selekterar BÅDA start-paths (arketyp-intern at0006 +
 * composition.context.start_time). Mapper-lagret prefer:ar at0006 där den finns
 * och fall:ar tillbaka på context. Skälet: framtida CDR-data kan ha retroaktiv
 * inrapportering där composition skapas senare än medicineringen startade —
 * arketyp-intern start_date är då den korrekta klinisk-tidpunkten.
 */
export function aqlMedicationSummary(patientId: string): string {
  return [
    `SELECT`,
    `  c/uid/value,`,
    `  c/context/start_time/value,`,
    `  m/data[at0001]/items[at0006]/value/value,`,
    `  m/data[at0001]/items[at0002]/value/value,`,
    `  m/data[at0001]/items[at0003]/value/defining_code/code_string`,
    `FROM EHR e CONTAINS COMPOSITION c CONTAINS EVALUATION m[openEHR-EHR-EVALUATION.medication_summary.v1]`,
    `WHERE e/ehr_status/subject/external_ref/id/value = '${escape(patientId)}'`,
  ].join(' ');
}

/**
 * laboratory_test_result.v1 — en rad per ELEMENT-set inom POINT_EVENT.
 * Kolumner: composition_uid, context_start_time, event_time, analyte_name,
 *           analyte_code, value_magnitude, value_units
 *
 * Notera: HBA1C/INR/kreatinin är alla samma struktur — varje composition har
 * EXAKT ETT analyte_result-set i Del 1 (en lab-event per composition).
 *
 * KU Steg 2: Vi selekterar BÅDA event-paths (POINT_EVENT.time + composition
 * context.start_time). Mappern prefererar event.time där den finns och fall:ar
 * tillbaka på context.start_time. Detta är paritet med medication-mappern:s
 * at0006 → context-fallback från Steg 1.
 */
export function aqlLaboratoryTestResult(patientId: string): string {
  return [
    `SELECT`,
    `  c/uid/value,`,
    `  c/context/start_time/value,`,
    `  obs/data[at0001]/events[at0002]/time/value,`,
    `  obs/data[at0001]/events[at0002]/data[at0003]/items[at0004]/value/value,`,
    `  obs/data[at0001]/events[at0002]/data[at0003]/items[at0005]/value/defining_code/code_string,`,
    `  obs/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/magnitude,`,
    `  obs/data[at0001]/events[at0002]/data[at0003]/items[at0006]/value/units`,
    `FROM EHR e CONTAINS COMPOSITION c CONTAINS OBSERVATION obs[openEHR-EHR-OBSERVATION.laboratory_test_result.v1]`,
    `WHERE e/ehr_status/subject/external_ref/id/value = '${escape(patientId)}'`,
  ].join(' ');
}

function escape(s: string): string {
  // EHRbase AQL stöder enkelt single-quote escape (dubbla quotes).
  return s.replace(/'/g, "''");
}
