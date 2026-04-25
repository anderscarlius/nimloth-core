// API-klient via Vite-proxy. Browsern anropar /api/fhir/... → FHIR Facade,
// /api/cds → CDS Hooks, /api/audit → Audit-tjänsten.

import type {
  FhirBundle,
  FhirPatient,
  FhirMedicationStatement,
  FhirProcedure,
  FhirCondition,
  FhirObservation,
  FhirAllergyIntolerance,
  FhirEncounter,
  FhirResource,
  CdsResponse,
  AuditRow,
} from './types';

const FHIR = '/api/fhir';
const CDS = '/api/cds';
const AUDIT = '/api/audit';

function commonHeaders(): HeadersInit {
  return {
    'X-User-HSA': 'SE-DASHBOARD-DEMO',
    'X-User-Role': 'PHYSICIAN',
    'X-PDL-Care-Relation': 'true',
    'X-PDL-Purpose': 'CARE',
    'X-PDL-Care-Unit': 'SE2321000131-E000000000001',
  };
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...commonHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return (await res.json()) as T;
}

// ============================================================
// FHIR
// ============================================================
export async function searchPatient(personnummer: string): Promise<FhirBundle<FhirPatient>> {
  return jsonFetch(`${FHIR}/Patient?identifier=${encodeURIComponent(personnummer)}`);
}

export async function getPatient(id: string): Promise<FhirPatient> {
  return jsonFetch(`${FHIR}/Patient/${encodeURIComponent(id)}`);
}

export async function getEverything(patientId: string): Promise<FhirBundle> {
  return jsonFetch(`${FHIR}/Patient/${encodeURIComponent(patientId)}/$everything`);
}

export async function searchMedications(patientId: string, status = 'active'): Promise<FhirBundle<FhirMedicationStatement>> {
  return jsonFetch(`${FHIR}/MedicationStatement?patient=${encodeURIComponent(patientId)}&status=${status}`);
}

export async function searchProcedures(patientId: string): Promise<FhirBundle<FhirProcedure>> {
  return jsonFetch(`${FHIR}/Procedure?patient=${encodeURIComponent(patientId)}`);
}

export async function searchConditions(patientId: string): Promise<FhirBundle<FhirCondition>> {
  return jsonFetch(`${FHIR}/Condition?patient=${encodeURIComponent(patientId)}`);
}

export async function searchObservations(patientId: string, category?: string): Promise<FhirBundle<FhirObservation>> {
  const q = new URLSearchParams({ patient: patientId });
  if (category) q.set('category', category);
  return jsonFetch(`${FHIR}/Observation?${q.toString()}`);
}

export async function searchAllergies(patientId: string): Promise<FhirBundle<FhirAllergyIntolerance>> {
  return jsonFetch(`${FHIR}/AllergyIntolerance?patient=${encodeURIComponent(patientId)}`);
}

export async function searchEncounters(patientId: string): Promise<FhirBundle<FhirEncounter>> {
  return jsonFetch(`${FHIR}/Encounter?patient=${encodeURIComponent(patientId)}`);
}

// ============================================================
// CDS Hooks
// ============================================================
export async function getCdsCards(patientId: string): Promise<CdsResponse> {
  return jsonFetch(`${CDS}/cds-services/core-patient-alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hookInstance: crypto.randomUUID(),
      hook: 'patient-view',
      context: { userId: 'Practitioner/SE-DASHBOARD-DEMO', patientId: `Patient/${patientId}` },
    }),
  });
}

export async function getCdsDiscovery(): Promise<{ services: Array<{ id: string; title: string; description: string }> }> {
  return jsonFetch(`${CDS}/cds-services`);
}

// ============================================================
// Audit
// ============================================================
export async function searchAudit(params: {
  patient?: string;
  actor?: string;
  limit?: number;
}): Promise<{ total: number; results: AuditRow[] }> {
  const q = new URLSearchParams();
  if (params.patient) q.set('patient', params.patient);
  if (params.actor) q.set('actor', params.actor);
  if (params.limit) q.set('limit', String(params.limit));
  return jsonFetch(`${AUDIT}/search?${q.toString()}`);
}

export async function getAuditStats(): Promise<{
  by_day: Array<{ day: string; count: number }>;
  by_resource_type: Array<{ resource_type: string; count: number }>;
  by_outcome: Array<{ outcome: string; count: number }>;
}> {
  return jsonFetch(`${AUDIT}/stats`);
}

// ============================================================
// Helpers för att plocka ut resurser ur en Bundle
// ============================================================
export function entries<T extends FhirResource>(bundle: FhirBundle<T> | undefined): T[] {
  return bundle?.entry?.map((e) => e.resource) ?? [];
}

export function entriesByType<T extends FhirResource>(bundle: FhirBundle | undefined, type: T['resourceType']): T[] {
  return (bundle?.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is T => r.resourceType === type);
}
