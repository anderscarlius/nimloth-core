// $everything — Bundle med ALLA resurser för en patient.
// Fru Andersson-scenariot: returnera Patient + Observations + MedicationStatements
// + Conditions + Procedures + AllergyIntolerances + Encounters + CarePlans (tom).

import type pg from 'pg';
import { Router } from 'express';
import type { FhirBundle, FhirResource } from '@nimloth-core/shared/types';
import { findPatientById, renderPatient, notFound } from '../resources/patient.js';
import { findObservationsByPatient, renderObservation } from '../resources/observation.js';
import { findMedicationsByPatient, renderMedicationStatement } from '../resources/medication-statement.js';
import { findConditionsByPatient, renderCondition } from '../resources/condition.js';
import { findProceduresByPatient, renderProcedure } from '../resources/procedure.js';
import { findAllergiesByPatient, renderAllergyIntolerance } from '../resources/allergy-intolerance.js';
import { findEncountersByPatient, renderEncounter } from '../resources/encounter.js';
import { buildDiagnosticReportsForPatient } from '../resources/diagnostic-report.js';

export async function patientEverything(pool: pg.Pool, pnr: string): Promise<FhirBundle | null> {
  const patient = await findPatientById(pool, pnr);
  if (!patient) return null;

  const [obs, meds, cond, proc, allergy, enc] = await Promise.all([
    findObservationsByPatient(pool, pnr),
    findMedicationsByPatient(pool, pnr),
    findConditionsByPatient(pool, pnr),
    findProceduresByPatient(pool, pnr),
    findAllergiesByPatient(pool, pnr),
    findEncountersByPatient(pool, pnr),
  ]);

  const labObs = obs.filter((o) => o.category === 'laboratory');
  const diagReports = buildDiagnosticReportsForPatient(labObs);

  const resources: FhirResource[] = [
    renderPatient(patient),
    ...enc.map(renderEncounter),
    ...obs.map(renderObservation),
    ...meds.map(renderMedicationStatement),
    ...cond.map(renderCondition),
    ...proc.map(renderProcedure),
    ...allergy.map(renderAllergyIntolerance),
    ...diagReports,
  ];

  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((r) => ({
      fullUrl: `https://core.nimloth.io/fhir/r4/${r.resourceType}/${'id' in r ? (r as { id: string }).id : ''}`,
      resource: r,
      search: { mode: r.resourceType === 'Patient' ? 'match' : 'include' },
    })),
  };
}

export function everythingRouter(pool: pg.Pool): Router {
  const router = Router({ mergeParams: true });
  router.get('/', async (req, res, next) => {
    try {
      const pnr = (req.params as { id?: string }).id;
      if (!pnr) return notFound(res, 'Patient', '(missing id)');
      const bundle = await patientEverything(pool, pnr);
      if (!bundle) return notFound(res, 'Patient', pnr);
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  return router;
}
