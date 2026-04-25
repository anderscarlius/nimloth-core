// Dispatcher: mappar source_table → mapper-funktion.

import type { Mapper } from '../types.js';
import { mapVitals } from './vitals.js';
import { mapLabResult } from './lab-results.js';
import { mapMedication } from './medications.js';
import { mapProcedure } from './procedures.js';
import { mapEncounter } from './encounters.js';
import { mapCondition } from './conditions.js';
import { mapAllergy } from './allergies.js';

export const MAPPERS: Record<string, Mapper> = {
  observations: mapVitals,
  lab_results: mapLabResult,
  prescriptions: mapMedication,
  procedures: mapProcedure,
  encounters: mapEncounter,
  diagnoses: mapCondition,
  allergies: mapAllergy,
};

export {
  mapVitals,
  mapLabResult,
  mapMedication,
  mapProcedure,
  mapEncounter,
  mapCondition,
  mapAllergy,
};
