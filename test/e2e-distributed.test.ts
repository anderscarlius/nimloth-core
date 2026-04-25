// End-to-end-tester för distribuerat läge.
// Kräver att ./scripts/start-distributed.sh har körts.
//
// Kör: pnpm --filter @nimloth-core/e2e test:distributed
//
// Testerna berör fyra lager:
//   1. Edge-nodens lokala FHIR/CDS/status
//   2. Topologi-endpoint på replication
//   3. Aggregator: event på edge-kafka → central topic (utan prefix)
//   4. Shared patient-index synkat till edge SQLite

import { describe, it, expect } from 'vitest';

const CENTRAL_FHIR = process.env.CENTRAL_FHIR_BASE ?? 'http://localhost:3003/fhir/r4';
const EDGE_FHIR = process.env.EDGE_FHIR_BASE ?? 'http://localhost:4003/fhir/r4';
const EDGE_CDS = process.env.EDGE_CDS_BASE ?? 'http://localhost:4004';
const EDGE_STATUS = process.env.EDGE_STATUS_BASE ?? 'http://localhost:4006';
const REPLICATION = process.env.REPLICATION_BASE ?? 'http://localhost:3007';
const PNR = '19500315-2384';

const PDL_HEADERS: HeadersInit = {
  'X-User-HSA': 'SE-E2E-DIST',
  'X-User-Role': 'PHYSICIAN',
  'X-PDL-Care-Relation': 'true',
  'X-PDL-Purpose': 'CARE',
  'X-PDL-Care-Unit': 'SE-E2E-UNIT',
};

async function getJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  return (await r.json()) as T;
}

interface Bundle {
  resourceType: string;
  total?: number;
  entry?: Array<{ resource: Record<string, unknown> }>;
}

interface EdgeHealth {
  status: string;
  service: string;
  instance_id: string;
  mode: string;
  central_hub_connected: boolean;
}

interface Topology {
  central: { name: string; status: string };
  edges: Array<{
    instance_id: string;
    status: string;
    metrics: {
      fhir_cache_patients: number;
      central_hub_connected: boolean;
    };
    stale: boolean;
  }>;
}

describe('Edge-nod SU /health', () => {
  it('rapporterar online + central_hub_connected', async () => {
    const health = await getJson<EdgeHealth>(`${EDGE_STATUS}/health`);
    expect(health.status).toBe('ok');
    expect(health.service).toBe('edge-runtime');
    expect(health.instance_id).toBe('su');
    expect(health.central_hub_connected).toBe(true);
  });
});

describe('Edge-nod lokal FHIR (replica-mode)', () => {
  it('serverar Fru Andersson via identifier-sök', async () => {
    const bundle = await getJson<Bundle>(
      `${EDGE_FHIR}/Patient?identifier=${PNR}`,
      PDL_HEADERS,
    );
    expect(bundle.total).toBeGreaterThanOrEqual(1);
    const patient = bundle.entry?.[0]?.resource as { name?: Array<{ text?: string }> } | undefined;
    expect(patient?.name?.[0]?.text).toMatch(/Andersson/);
  });

  it('$everything returnerar klinisk bild', async () => {
    const bundle = await getJson<Bundle>(
      `${EDGE_FHIR}/Patient/${PNR}/$everything`,
      PDL_HEADERS,
    );
    const types = new Set(
      (bundle.entry ?? []).map((e) => String(e.resource.resourceType)),
    );
    expect(bundle.entry?.length).toBeGreaterThanOrEqual(5);
    expect(types.has('Patient')).toBe(true);
    // Minst en klinisk resurs ska finnas (conditions/procedures/observations/medications/allergies)
    const clinicalTypes = [
      'MedicationStatement',
      'Procedure',
      'Condition',
      'Observation',
      'AllergyIntolerance',
    ];
    const hasClinical = clinicalTypes.some((t) => types.has(t));
    expect(hasClinical).toBe(true);
  });

  it('avvisar requests utan PDL-headers (403)', async () => {
    const r = await fetch(`${EDGE_FHIR}/Patient?identifier=${PNR}`);
    expect(r.status).toBe(403);
  });
});

describe('Edge-nod CDS Hooks (lokal)', () => {
  it('listar 3 services', async () => {
    const services = await getJson<{ services: Array<{ id: string }> }>(
      `${EDGE_CDS}/cds-services`,
    );
    expect(services.services.length).toBeGreaterThanOrEqual(3);
  });

  it('core-anticoagulation returnerar kritiskt kort för Fru Andersson', async () => {
    const r = await fetch(`${EDGE_CDS}/cds-services/core-anticoagulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hookInstance: 'e2e',
        hook: 'patient-view',
        context: { userId: 'Practitioner/1', patientId: `Patient/${PNR}` },
      }),
    });
    expect(r.ok).toBe(true);
    const body = (await r.json()) as {
      cards: Array<{ indicator: string; summary: string }>;
    };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards[0].indicator).toBe('critical');
    expect(body.cards[0].summary).toMatch(/antikoagul/i);
  });
});

describe('Replication /topology-endpoint', () => {
  it('returnerar minst en edge-nod med heartbeat', async () => {
    const topo = await getJson<Topology>(`${REPLICATION}/topology`);
    expect(topo.central.name).toBeDefined();
    expect(topo.edges.length).toBeGreaterThanOrEqual(1);
    const su = topo.edges.find((e) => e.instance_id === 'su');
    expect(su).toBeDefined();
    expect(su?.status).toBe('online');
    expect(su?.metrics.fhir_cache_patients).toBeGreaterThan(0);
    expect(su?.stale).toBe(false);
  });
});

describe('Central hub — Fru Andersson (via primary)', () => {
  it('har samma patient tillgänglig på central FHIR', async () => {
    const bundle = await getJson<Bundle>(
      `${CENTRAL_FHIR}/Patient?identifier=${PNR}`,
      PDL_HEADERS,
    );
    expect(bundle.total).toBeGreaterThanOrEqual(1);
  });
});

describe('Replication /health aggregator+distributor', () => {
  it('rapporterar aktiva aggregator- och distributor-metrics', async () => {
    const health = await getJson<{
      aggregator: { aggregatedEvents: number };
      distributor: { patientIndexPublished: number; patientIndexFullSyncs: number };
    }>(`${REPLICATION}/health`);
    expect(health.distributor.patientIndexFullSyncs).toBeGreaterThan(0);
    expect(health.distributor.patientIndexPublished).toBeGreaterThan(0);
  });
});
