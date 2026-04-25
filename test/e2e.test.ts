// End-to-end-test mot live Nimloth Core.
// Kräver att ./scripts/start.sh kört och tjänster är healthy.
// Kör: pnpm --filter @nimloth-core/e2e test  (eller pnpm test:e2e)

import { describe, expect, it } from 'vitest';

const FHIR = process.env.FHIR_BASE ?? 'http://localhost:3003/fhir/r4';
const CDS = process.env.CDS_BASE ?? 'http://localhost:3004';
const AUDIT = process.env.AUDIT_BASE ?? 'http://localhost:3005';
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
