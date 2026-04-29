// FhirStore — gemensamt interface som postgres-store och openehr-store
// implementerar. Lägger grunden för framtida mikrotjänst-extraktion utan
// att bygga den nu (Anders' tillägg A, P3.3 Steg 4.5).
//
// Varför interface istället för bara klasser: när vi senare vill extrahera
// openehr-store till mikrotjänst byter vi `OpenehrStore` mot
// `RemoteOpenehrStoreClient` med exakt samma signaturer. Route-handlers i
// resources/*.ts är koppling-fria.
//
// Notera: alla metoder tar StoreContext för PDL-data + telemetri-spårning.
// Det är hur vi vet vilken patient som efterfrågas (för audit) och vilken
// kontext som gäller (kan i framtiden påverka filtrering på care-unit-nivå).

import type { FhirPatient, FhirObservation, FhirMedicationStatement, FhirProcedure, FhirCondition } from '@nimloth-core/shared/types';

/** Vilken store som faktiskt svarade — populeras av router för audit (Anders' tillägg B). */
export type CanonicalStore = 'postgres' | 'openehr';

/** Förfrågan-skopad kontext som flödar genom call-stack från PDL-middleware. */
export interface StoreContext {
  /** Vilken klinikers HSA-id som gör läsningen (för audit). */
  userHsa?: string;
  /** Vårdenheten där läsningen sker. */
  careUnit?: string;
  /** PDL-syfte. Påverkar inte store-val men loggas. */
  purpose?: 'CARE' | 'EMERGENCY' | 'QUALITY_REGISTRY' | 'ADMINISTRATION';
}

export interface SearchObservationParams {
  patient: string;
  category?: string;
  /** Begränsa till tidsintervall (ISO-datetime). */
  from?: string;
  to?: string;
  limit?: number;
}

export interface SearchByPatientParams {
  patient: string;
  limit?: number;
}

/**
 * FhirStore — minimal yta för Sprint 2 (Patient + 4 clinical resources).
 *
 * Extensions:
 *   - allergyIntolerance, encounter, careplan etc kan läggas till när
 *     mer av Fru Andersson-flödet ska vara dual-store.
 *   - $everything-operationen är route-level och anropar flera Store-metoder.
 *
 * Returnerar `null` när resurs inte finns. Kasta för verkliga fel (DB nere etc).
 */
export interface FhirStore {
  /** Vilken canonical store detta är — sätts av router i audit (tillägg B). */
  readonly canonicalStore: CanonicalStore;

  /** Patient by id (svenskt PNR). */
  getPatient(id: string, ctx: StoreContext): Promise<FhirPatient | null>;

  /** Patient-sök på identifier eller namn. */
  searchPatients(
    params: { identifier?: string; family?: string; given?: string; limit?: number },
    ctx: StoreContext,
  ): Promise<FhirPatient[]>;

  /** Observations för en patient, valfritt filtrerade på category/datum. */
  searchObservations(params: SearchObservationParams, ctx: StoreContext): Promise<FhirObservation[]>;

  /** MedicationStatements för en patient. */
  searchMedicationStatements(params: SearchByPatientParams, ctx: StoreContext): Promise<FhirMedicationStatement[]>;

  /** Procedures för en patient. */
  searchProcedures(params: SearchByPatientParams, ctx: StoreContext): Promise<FhirProcedure[]>;

  /** Conditions för en patient. */
  searchConditions(params: SearchByPatientParams, ctx: StoreContext): Promise<FhirCondition[]>;
}
