// PostgresStore — FhirStore-implementation som lindar de existerande
// free-funktioner i resources/*.ts. Inga ändringar i deras logik; vi exponerar
// dem genom interface så store-router kan välja mellan postgres och openehr.
//
// När/om openehr-store extraheras till mikrotjänst i framtiden förblir
// PostgresStore opåverkad — det är bara OpenehrStore som byts mot
// RemoteOpenehrStoreClient.

import type pg from 'pg';
import type {
  FhirPatient,
  FhirObservation,
  FhirMedicationStatement,
  FhirProcedure,
  FhirCondition,
  FhirAllergyIntolerance,
} from '@nimloth-core/shared/types';
import type {
  CanonicalStore,
  FhirStore,
  StoreContext,
  SearchObservationParams,
  SearchByPatientParams,
} from './types.js';
import { findPatientById, searchPatients as searchPatientRows, renderPatient } from '../resources/patient.js';
import { findObservationsByPatient, renderObservation } from '../resources/observation.js';
import {
  findMedicationsByPatient,
  renderMedicationStatement,
} from '../resources/medication-statement.js';
import { findProceduresByPatient, renderProcedure } from '../resources/procedure.js';
import { findConditionsByPatient, renderCondition } from '../resources/condition.js';
import { findAllergiesByPatient, renderAllergyIntolerance } from '../resources/allergy-intolerance.js';

export class PostgresStore implements FhirStore {
  readonly canonicalStore: CanonicalStore = 'postgres';

  constructor(private readonly pool: pg.Pool) {}

  async getPatient(id: string, _ctx: StoreContext): Promise<FhirPatient | null> {
    const row = await findPatientById(this.pool, id);
    return row ? renderPatient(row) : null;
  }

  async searchPatients(
    params: { identifier?: string; family?: string; given?: string; limit?: number },
    _ctx: StoreContext,
  ): Promise<FhirPatient[]> {
    const rows = await searchPatientRows(this.pool, params);
    return rows.map(renderPatient);
  }

  async searchObservations(
    params: SearchObservationParams,
    _ctx: StoreContext,
  ): Promise<FhirObservation[]> {
    const rows = await findObservationsByPatient(
      this.pool,
      params.patient,
      params.category,
      undefined,
      params.limit ?? 100,
    );
    let observations = rows.map(renderObservation);
    if (params.from) {
      observations = observations.filter((o) => (o.effectiveDateTime ?? '') >= params.from!);
    }
    if (params.to) {
      observations = observations.filter((o) => (o.effectiveDateTime ?? '') <= params.to!);
    }
    return observations;
  }

  async searchMedicationStatements(
    params: SearchByPatientParams,
    _ctx: StoreContext,
  ): Promise<FhirMedicationStatement[]> {
    const rows = await findMedicationsByPatient(this.pool, params.patient, undefined, params.limit ?? 100);
    return rows.map(renderMedicationStatement);
  }

  async searchProcedures(
    params: SearchByPatientParams,
    _ctx: StoreContext,
  ): Promise<FhirProcedure[]> {
    const rows = await findProceduresByPatient(this.pool, params.patient, params.limit ?? 100);
    return rows.map(renderProcedure);
  }

  async searchConditions(
    params: SearchByPatientParams,
    _ctx: StoreContext,
  ): Promise<FhirCondition[]> {
    const rows = await findConditionsByPatient(this.pool, params.patient, params.limit ?? 100);
    return rows.map(renderCondition);
  }

  async searchAllergyIntolerances(
    params: SearchByPatientParams,
    _ctx: StoreContext,
  ): Promise<FhirAllergyIntolerance[]> {
    const rows = await findAllergiesByPatient(this.pool, params.patient, params.limit ?? 50);
    return rows.map(renderAllergyIntolerance);
  }
}
