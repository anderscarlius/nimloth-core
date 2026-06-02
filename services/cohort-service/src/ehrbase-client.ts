// Minimal EHRbase REST-klient för cohort-service.
//
// Behövs för clinical-events- och lineage-endpoints. Cohort-service kör i
// nimloth-core-nätet → når ehrbase via container-namn (http://ehrbase:8080/ehrbase).
//
// ÄRLIGHETSREGEL: returnera bara vad EHRbase faktiskt håller. Synd inte ihop
// en HSA-signatär eller annan klinisk metadata. EHRbase commit-audit har
// `committer.name = "EHRbase Internal anonymousUser"` på vår syntetiska data
// — det är ärligheten i ren form. Returnera den oförändrad.

export interface EhrbaseClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export interface AqlResponse {
  rows: unknown[][];
  meta?: Record<string, unknown>;
}

/** AUDIT_DETAILS-vy från EHRbase revision_history. INGEN HSA — bara vad systemet har. */
export interface CommitAudit {
  committer_name: string | null;
  committer_external_id: string | null;
  time_committed: string | null;
  change_type: string | null;
}

/** Bekväm content_summary per arketyp — vad cohort-service extraherar för UI. */
export type ContentSummary =
  | {
      kind: 'medication_summary';
      medication_text: string | null;
      atc_code: string | null;
    }
  | {
      kind: 'laboratory_test_result';
      analyte_name: string | null;
      analyte_code: string | null;
      magnitude: number | null;
      units: string | null;
    }
  | { kind: 'other'; archetype: string | null };

export interface CompositionLineage {
  composition_uid: string;
  ehr_id: string;
  composer_name: string | null;
  template_id: string | null;
  start_time: string | null;
  content_summary: ContentSummary;
  commit_audit: CommitAudit | null;
}

export interface ClinicalEvent {
  composition_uid: string;
  template_id: string | null;
  start_time: string | null;
  /** composer.name — den korta klinisk-narrativa strängen SDG satte. */
  display: string | null;
  commit_audit: CommitAudit | null;
}

export class EhrbaseClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: EhrbaseClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctl.signal });
    } finally {
      clearTimeout(t);
    }
  }

  /** POST /rest/openehr/v1/query/aql */
  async runAql(aql: string): Promise<AqlResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/rest/openehr/v1/query/aql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: aql }),
    });
    if (!res.ok) throw new Error(`AQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as AqlResponse;
  }

  /**
   * Resolvera ehr_id för en given composition_uid (oavsett om uid har host-suffix
   * eller bara UUID-prefix). AQL stöder bägge.
   */
  async resolveEhrId(compositionUid: string): Promise<string | null> {
    const esc = compositionUid.replace(/'/g, "''");
    const res = await this.runAql(
      `SELECT e/ehr_id/value FROM EHR e CONTAINS COMPOSITION c WHERE c/uid/value = '${esc}'`,
    );
    const row = res.rows[0];
    return row ? String(row[0]) : null;
  }

  /** GET /rest/openehr/v1/ehr/{ehr_id}/composition/{uid} */
  async getComposition(ehrId: string, uuidOnly: string): Promise<Record<string, unknown> | null> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/rest/openehr/v1/ehr/${ehrId}/composition/${uuidOnly}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`composition GET ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  /** GET .../versioned_composition/{uuid}/revision_history → committer + time_committed. */
  async getCommitAudit(ehrId: string, uuidOnly: string): Promise<CommitAudit | null> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/rest/openehr/v1/ehr/${ehrId}/versioned_composition/${uuidOnly}/revision_history`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      items?: Array<{ audits?: Array<Record<string, unknown>> }>;
    };
    const audit = body.items?.[0]?.audits?.[0];
    if (!audit) return null;
    const committer = audit.committer as { name?: string; external_ref?: { id?: { value?: string } } } | undefined;
    return {
      committer_name: committer?.name ?? null,
      committer_external_id: committer?.external_ref?.id?.value ?? null,
      time_committed:
        (audit.time_committed as { value?: string } | undefined)?.value ?? null,
      change_type: (audit.change_type as { value?: string } | undefined)?.value ?? null,
    };
  }

  /** Lista alla kompositioner för en patient (subject_id) — för clinical-events. */
  async listCompositionsForPatient(subjectId: string): Promise<
    Array<{ uid: string; template_id: string | null; start_time: string | null; composer_name: string | null }>
  > {
    const esc = subjectId.replace(/'/g, "''");
    const aql =
      `SELECT c/uid/value, c/archetype_details/template_id/value, c/context/start_time/value, c/composer/name ` +
      `FROM EHR e CONTAINS COMPOSITION c ` +
      `WHERE e/ehr_status/subject/external_ref/id/value = '${esc}' ` +
      `ORDER BY c/context/start_time/value`;
    const res = await this.runAql(aql);
    return res.rows.map((r) => ({
      uid: String(r[0]),
      template_id: (r[1] as string | null) ?? null,
      start_time: (r[2] as string | null) ?? null,
      composer_name: (r[3] as string | null) ?? null,
    }));
  }
}

/**
 * Extrahera content_summary från en composition-canonical-JSON-body.
 * Stöder medication_summary.v1 + laboratory_test_result.v1.
 */
export function extractContentSummary(composition: Record<string, unknown>): ContentSummary {
  const content = composition.content as Array<Record<string, unknown>> | undefined;
  if (!content || content.length === 0) return { kind: 'other', archetype: null };
  for (const c of content) {
    const arch = (c.archetype_node_id as string | undefined) ?? '';
    if (arch.includes('medication_summary')) {
      // EVALUATION → data.items[at0002 medication_name, at0003 atc_code]
      const items = ((c.data as { items?: Array<Record<string, unknown>> } | undefined)?.items ??
        []) as Array<Record<string, unknown>>;
      const text = pickElement(items, 'at0002', 'value');
      const atc = pickElement(items, 'at0003', 'defining_code.code_string');
      return { kind: 'medication_summary', medication_text: text, atc_code: atc };
    }
    if (arch.includes('laboratory_test_result')) {
      // OBSERVATION → data.events[0].data.items[at0004 name, at0005 code, at0006 result]
      const events =
        ((c.data as { events?: Array<Record<string, unknown>> } | undefined)?.events ?? []) as Array<
          Record<string, unknown>
        >;
      const evItems = (((events[0]?.data as { items?: Array<Record<string, unknown>> } | undefined)
        ?.items ?? []) as Array<Record<string, unknown>>);
      const name = pickElement(evItems, 'at0004', 'value');
      const code = pickElement(evItems, 'at0005', 'defining_code.code_string');
      const magnitude = pickElement(evItems, 'at0006', 'magnitude');
      const units = pickElement(evItems, 'at0006', 'units');
      return {
        kind: 'laboratory_test_result',
        analyte_name: name,
        analyte_code: code,
        magnitude: magnitude !== null && magnitude !== undefined ? Number(magnitude) : null,
        units,
      };
    }
  }
  const firstArch = (content[0]?.archetype_node_id as string | undefined) ?? null;
  return { kind: 'other', archetype: firstArch };
}

function pickElement<T = string>(
  items: Array<Record<string, unknown>>,
  archetypeNodeId: string,
  valuePath: string,
): T | null {
  const item = items.find((it) => it.archetype_node_id === archetypeNodeId);
  if (!item) return null;
  const value = item.value as Record<string, unknown> | undefined;
  if (!value) return null;
  const parts = valuePath.split('.');
  let cur: unknown = value;
  for (const p of parts) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
    else return null;
  }
  return (cur ?? null) as T | null;
}
