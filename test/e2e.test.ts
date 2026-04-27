// End-to-end-test mot live Nimloth Core.
// Kräver att ./scripts/start.sh kört och tjänster är healthy.
// Kör: pnpm --filter @nimloth-core/e2e test  (eller pnpm test:e2e)

import { describe, expect, it } from 'vitest';

const FHIR = process.env.FHIR_BASE ?? 'http://localhost:3003/fhir/r4';
const CDS = process.env.CDS_BASE ?? 'http://localhost:3004';
const AUDIT = process.env.AUDIT_BASE ?? 'http://localhost:3005';
const MAPPING = process.env.MAPPING_BASE ?? 'http://localhost:3009';
const PNR = '19500315-2384';

const HEADERS: HeadersInit = {
  'X-User-HSA': 'SE-E2E-TEST',
  'X-User-Role': 'PHYSICIAN',
  'X-PDL-Care-Relation': 'true',
  'X-PDL-Purpose': 'CARE',
  'X-PDL-Care-Unit': 'SE-E2E-CARE-UNIT',
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { ...HEADERS, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`);
  return (await r.json()) as T;
}

interface Bundle {
  resourceType: string;
  total?: number;
  entry?: Array<{ resource: { resourceType: string; [k: string]: unknown } }>;
}

describe('Health-checks', () => {
  it.each([
    ['FHIR Facade', `${FHIR.replace(/\/fhir\/r4$/, '')}/health`],
    ['CDS Hooks', `${CDS}/health`],
    ['Audit', `${AUDIT}/health`],
  ])('%s /health returnerar ok', async (_name, url) => {
    const r = await fetch(url);
    expect(r.ok).toBe(true);
    const data = (await r.json()) as { status?: string };
    expect(data.status).toBe('ok');
  });
});

describe('Patient-sökning', () => {
  it('hittar Fru Andersson via identifier', async () => {
    const bundle = await getJson<Bundle>(`${FHIR}/Patient?identifier=${PNR}`);
    expect(bundle.total).toBeGreaterThanOrEqual(1);
    const patient = bundle.entry?.[0]?.resource as { id: string; name?: Array<{ family?: string }> } | undefined;
    expect(patient?.name?.[0]?.family).toBe('Andersson');
  });
});

describe('$everything för Fru Andersson', () => {
  it('innehåller patient + procedures + medications + conditions + allergies', async () => {
    const bundle = await getJson<Bundle>(`${FHIR}/Patient/${PNR}/$everything`);
    expect(bundle.total).toBeGreaterThanOrEqual(10);

    const types = new Set(bundle.entry?.map((e) => e.resource.resourceType));
    expect(types.has('Patient')).toBe(true);
    expect(types.has('Procedure')).toBe(true);
    expect(types.has('MedicationStatement')).toBe(true);
    expect(types.has('Condition')).toBe(true);
    expect(types.has('AllergyIntolerance')).toBe(true);
  });

  it('har minst 1 procedure med implant-details extension', async () => {
    const bundle = await getJson<Bundle>(`${FHIR}/Patient/${PNR}/$everything`);
    const procs = (bundle.entry ?? [])
      .map((e) => e.resource as { resourceType: string; extension?: Array<{ url: string }> })
      .filter((r) => r.resourceType === 'Procedure');
    const withImplant = procs.filter((p) =>
      p.extension?.some((e) => e.url === 'https://core.nimloth.io/fhir/StructureDefinition/implant-details'),
    );
    expect(withImplant.length).toBeGreaterThanOrEqual(1);
  });

  it('har MedicationStatement med Waran (ATC B01AA03)', async () => {
    const meds = await getJson<Bundle>(`${FHIR}/MedicationStatement?patient=${PNR}&status=active`);
    const hasWaran = (meds.entry ?? []).some((e) => {
      const r = e.resource as { medicationCodeableConcept?: { coding?: Array<{ code?: string }> } };
      return r.medicationCodeableConcept?.coding?.some((c) => c.code === 'B01AA03');
    });
    expect(hasWaran).toBe(true);
  });

  it('har Condition med DVT (ICD I80-I82)', async () => {
    const conds = await getJson<Bundle>(`${FHIR}/Condition?patient=${PNR}`);
    const hasDvt = (conds.entry ?? []).some((e) => {
      const r = e.resource as { code?: { coding?: Array<{ code?: string }> } };
      return r.code?.coding?.some((c) => c.code?.startsWith('I80') || c.code?.startsWith('I81') || c.code?.startsWith('I82'));
    });
    expect(hasDvt).toBe(true);
  });

  it('har AllergyIntolerance med Penicillin', async () => {
    const all = await getJson<Bundle>(`${FHIR}/AllergyIntolerance?patient=${PNR}`);
    const hasPen = (all.entry ?? []).some((e) => {
      const r = e.resource as { code?: { text?: string; coding?: Array<{ display?: string }> } };
      const text = r.code?.text ?? r.code?.coding?.[0]?.display ?? '';
      return text.toLowerCase().includes('penicillin');
    });
    expect(hasPen).toBe(true);
  });
});

describe('CDS Hooks', () => {
  it('discovery listar minst 3 services', async () => {
    const d = await getJson<{ services: Array<{ id: string }> }>(`${CDS}/cds-services`);
    expect(d.services.length).toBeGreaterThanOrEqual(3);
  });

  it('core-patient-alerts returnerar 3 cards för Fru Andersson', async () => {
    const body = {
      hookInstance: 'e2e-' + crypto.randomUUID(),
      hook: 'patient-view',
      context: { userId: 'Practitioner/SE-E2E-TEST', patientId: `Patient/${PNR}` },
    };
    const resp = await getJson<{ cards: Array<{ indicator: string; summary: string }> }>(
      `${CDS}/cds-services/core-patient-alerts`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    expect(resp.cards.length).toBe(3);
    const indicators = resp.cards.map((c) => c.indicator);
    expect(indicators).toContain('critical');
    expect(indicators).toContain('info');
  });
});

describe('Audit trail', () => {
  it('innehåller de nyligen utförda accesserna', async () => {
    // Vänta kort för att låta audit-batchen flush:as.
    await new Promise((r) => setTimeout(r, 2000));
    const resp = await getJson<{ total: number; results: Array<{ resource_type: string; outcome: string }> }>(
      `${AUDIT}/audit/search?patient=${PNR}&limit=50`,
    );
    expect(resp.total).toBeGreaterThan(0);
    const resources = new Set(resp.results.map((r) => r.resource_type));
    expect(resources.has('Patient')).toBe(true);
  });
});

// ============================================================
// Mapping-assistant (Sprint 2, P4)
// ============================================================
describe('Mapping-assistant — health + manifest', () => {
  it('/health rapporterar att prompts verifierats', async () => {
    const r = await fetch(`${MAPPING}/health`);
    expect(r.ok).toBe(true);
    const data = (await r.json()) as { status: string; promptsVerified: boolean };
    expect(data.status).toBe('ok');
    expect(data.promptsVerified).toBe(true);
  });

  it('/system-status listar 3 templates och router-providers', async () => {
    const r = await fetch(`${MAPPING}/system-status`);
    expect(r.ok).toBe(true);
    const data = (await r.json()) as {
      prompts: { passed: number; failed: number; templates: Array<{ name: string }> };
      router: { providers: Array<{ id: string; enabled: boolean }>; rules: Array<{ task: string }> };
    };
    expect(data.prompts.failed).toBe(0);
    expect(data.prompts.passed).toBe(3);
    const tplNames = new Set(data.prompts.templates.map((t) => t.name));
    expect(tplNames.has('propose-mapping')).toBe(true);
    expect(tplNames.has('explain-skip')).toBe(true);
    expect(tplNames.has('identify-pattern')).toBe(true);

    const rules = new Set(data.router.rules.map((r) => r.task));
    expect(rules.has('mapping.propose')).toBe(true);
    expect(rules.has('mapping.observe')).toBe(true);
    expect(rules.has('mapping.ask')).toBe(true);
  });
});

describe('Mapping-assistant — propose → approve flöde', () => {
  it('skapar suggestion via mock + godkänner via dashboard-API', async () => {
    // 1. Propose
    const proposeResp = await fetch(`${MAPPING}/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'e2e.flexlab.results',
        target: 'core.clinical.lab.result',
        schema: [
          { column: 'patient_id', type: 'integer' },
          { column: 'order_type', type: 'text' },
          { column: 'result_value', type: 'numeric' },
        ],
        samples: [{ patient_id: 1, order_type: 'STD', result_value: 42 }],
      }),
    });
    expect(proposeResp.status).toBe(201);
    const suggestion = (await proposeResp.json()) as {
      id: string;
      status: string;
      template_name: string;
      template_sha: string;
      prompt_hash: string;
      provider_id: string;
      data_residency: string;
    };
    expect(suggestion.status).toBe('pending');
    expect(suggestion.template_name).toBe('propose-mapping');
    expect(suggestion.template_sha).toMatch(/^[0-9a-f]{64}$/);
    expect(suggestion.prompt_hash).toMatch(/^[0-9a-f]{64}$/);

    // 2. Approve via samma endpoint som dashboard använder
    const approveResp = await fetch(`${MAPPING}/suggestions/${suggestion.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approver_hsa_id: 'SE-E2E-TEST',
        approver_role: 'integration-admin',
        reason: 'e2e auto-godkännande',
      }),
    });
    expect(approveResp.ok).toBe(true);
    const approved = (await approveResp.json()) as { status: string; approver_hsa_id: string };
    expect(approved.status).toBe('approved');
    expect(approved.approver_hsa_id).toBe('SE-E2E-TEST');

    // 3. Idempotens: andra approve ska inte ändra
    const secondApprove = await fetch(`${MAPPING}/suggestions/${suggestion.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approver_hsa_id: 'OTHER', approver_role: 'admin' }),
    });
    expect(secondApprove.status).toBe(404); // pending → not found
  });
});

describe('Mapping-assistant — observer-tröskel', () => {
  it('passerar tröskel ⇒ suggestion skapas via observe-task', async () => {
    // Skicka skip-events med unikt source-table för att inte krocka med tidigare runs
    const uniqueTable = `e2e_${Math.floor(Math.random() * 1000000)}`;
    const target = 11; // över default-tröskel 10

    for (let i = 0; i < target; i++) {
      const r = await fetch(`${MAPPING}/observer/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'skip',
          source_system: 'e2e',
          source_table: uniqueTable,
          column_name: 'order_type',
          reason: 'unknown_enum_value',
          sample_value: `URGENT_${i}`,
        }),
      });
      expect(r.status).toBe(202);
    }

    const evalResp = await fetch(`${MAPPING}/observer/evaluate`, { method: 'POST' });
    expect(evalResp.ok).toBe(true);
    const evalData = (await evalResp.json()) as { evaluated: number; created: number };
    expect(evalData.created).toBeGreaterThanOrEqual(1);

    // Verifiera att den nya suggestion finns i listan
    const list = await getJson<{ suggestions: Array<{ task: string; source: string }> }>(
      `${MAPPING}/suggestions?status=pending`,
    );
    const found = list.suggestions.find((s) => s.task === 'mapping.observe' && s.source.includes(uniqueTable));
    expect(found).toBeDefined();
  });
});

describe('Mapping-assistant — asker-flöde mot mock (PHI escalate)', () => {
  it('PHI-event → mock-fallback returnerar escalate', async () => {
    const eventId = `e2e-asker-${Math.floor(Math.random() * 1000000)}`;
    const enqueue = await fetch(`${MAPPING}/asker/pending`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        source_system: 'e2e',
        source_table: 'observations',
        mapper_name: 'observations-mapper',
        raw_event: { code: 'WEIRD_E2E', value: '42' },
        confidence: 'low',
      }),
    });
    expect(enqueue.status).toBe(202);

    const tick = await fetch(`${MAPPING}/asker/tick`, { method: 'POST' });
    expect(tick.ok).toBe(true);
    const tickData = (await tick.json()) as { processed: number };
    expect(tickData.processed).toBeGreaterThanOrEqual(1);

    // Verifiera escalated-räknare
    const status = await getJson<{ asker?: { escalatedTotal: number } }>(`${MAPPING}/system-status`);
    expect(status.asker?.escalatedTotal ?? 0).toBeGreaterThanOrEqual(1);
  });
});
