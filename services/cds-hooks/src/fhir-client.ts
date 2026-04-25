// Enkel FHIR-klient — används när CDS-request saknar prefetch.

import type { FhirBundle, FhirPatient } from '@nimloth-core/shared/types';
import type { Prefetch } from './types.js';

export class FhirClient {
  constructor(private readonly baseUrl: string) {}

  async fetchPatient(id: string): Promise<FhirPatient | null> {
    const r = await fetch(`${this.baseUrl}/Patient/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    return (await r.json()) as FhirPatient;
  }

  async fetchBundle(resourceType: string, query: string): Promise<FhirBundle | null> {
    const r = await fetch(`${this.baseUrl}/${resourceType}?${query}`);
    if (!r.ok) return null;
    return (await r.json()) as FhirBundle;
  }

  async fetchAllForPatient(patientId: string): Promise<Prefetch> {
    const [patient, medications, procedures, conditions, allergies] = await Promise.all([
      this.fetchPatient(patientId),
      this.fetchBundle('MedicationStatement', `patient=${encodeURIComponent(patientId)}&status=active`),
      this.fetchBundle('Procedure', `patient=${encodeURIComponent(patientId)}`),
      this.fetchBundle('Condition', `patient=${encodeURIComponent(patientId)}`),
      this.fetchBundle('AllergyIntolerance', `patient=${encodeURIComponent(patientId)}`),
    ]);
    return {
      patient: patient ?? undefined,
      medications: medications ?? undefined,
      procedures: procedures ?? undefined,
      conditions: conditions ?? undefined,
      allergies: allergies ?? undefined,
    };
  }
}
