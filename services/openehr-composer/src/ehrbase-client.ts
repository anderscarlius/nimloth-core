// Tunn HTTP-klient mot EHRbase REST. Inkapslar:
//   - PUT /ehr/{ehrId}                    (skapa EHR med svenskt PNR-subject)
//   - GET /ehr/{ehrId}                    (verifiera)
//   - POST /ehr/{ehrId}/composition       (skriv composition)
//   - GET /definition/template/adl1.4     (lista templates)
//   - POST /query/aql                     (AQL för verifiering)
//
// Designprinciper:
//   - Returnerar typade resultat. Fel kastas som Error med EHRbase-svaret
//     i meddelandet (för diagnostik i logs).
//   - Ingen automatisk retry — composern bestämmer policy.

import type { Logger } from 'pino';

export interface EhrStatus {
  _type: 'EHR_STATUS';
  archetype_node_id: string;
  name: { value: string };
  subject: {
    external_ref: {
      namespace: string;
      id: { _type: 'GENERIC_ID'; value: string; scheme: string };
      type: 'PERSON';
    };
  };
  is_modifiable: boolean;
  is_queryable: boolean;
}

export interface CompositionResponse {
  uid?: { value: string };
  [k: string]: unknown;
}

export class EhrbaseClient {
  constructor(private readonly baseUrl: string, private readonly logger: Logger) {}

  /** Skapa eller uppdatera EHR med given UUID. EHRbase 2.x stödjer PUT vid skapande. */
  async putEhr(ehrId: string, status: EhrStatus): Promise<void> {
    const url = `${this.baseUrl}/ehrbase/rest/openehr/v1/ehr/${ehrId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(status),
    });
    // 201 = created, 204 = no body. EHRbase 2.30 svarar 201 vid PUT-create.
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`EHRbase PUT /ehr/${ehrId} → ${res.status}: ${body.slice(0, 400)}`);
    }
  }

  /** Verifiera att EHR finns. Returnerar true vid 200, false vid 404, kastar annars. */
  async hasEhr(ehrId: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/ehrbase/rest/openehr/v1/ehr/${ehrId}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return false;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`EHRbase GET /ehr/${ehrId} → ${res.status}: ${body.slice(0, 400)}`);
    }
    return true;
  }

  /** Skriva composition. Returnerar composition-uid om EHRbase ger oss en. */
  async postComposition(
    ehrId: string,
    templateId: string,
    composition: Record<string, unknown>,
  ): Promise<string | null> {
    const url = `${this.baseUrl}/ehrbase/rest/openehr/v1/ehr/${ehrId}/composition`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Begär att composition returneras (default är "minimal" i 2.x).
        'Prefer': 'return=representation',
        'openEHR-TEMPLATE_ID': templateId,
      },
      body: JSON.stringify(composition),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `EHRbase POST composition (template=${templateId}) → ${res.status}: ${body.slice(0, 800)}`,
      );
    }
    const json = (await res.json().catch(() => null)) as CompositionResponse | null;
    return json?.uid?.value ?? null;
  }

  /** Lista laddade templates (snabb sanity-check vid startup). */
  async listTemplates(): Promise<Array<{ template_id: string; archetype_id: string }>> {
    const url = `${this.baseUrl}/ehrbase/rest/openehr/v1/definition/template/adl1.4`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`EHRbase GET /template → ${res.status}`);
    }
    return (await res.json()) as Array<{ template_id: string; archetype_id: string }>;
  }

  /** AQL-query för verifiering i tester. */
  async aql(query: string, params?: Record<string, unknown>): Promise<unknown> {
    const url = `${this.baseUrl}/ehrbase/rest/openehr/v1/query/aql`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ q: query, query_parameters: params ?? {} }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`EHRbase AQL → ${res.status}: ${body.slice(0, 400)}`);
    }
    return res.json();
  }
}
