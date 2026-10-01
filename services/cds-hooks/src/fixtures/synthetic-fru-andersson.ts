// Syntetisk Fru Andersson (dataclass 0) — delad prefetch för regler och WP-CDS1 smoke.

import type {
  FhirBundle,
  FhirCondition,
  FhirMedicationStatement,
  FhirPatient,
  FhirProcedure,
} from '@nimloth-core/shared/types';
import type { Prefetch } from '../types.js';

/** Demo-personnummer; ingen riktig patient. */
export const SYNTHETIC_PNR = '19500315-2384';

export function bundle<T extends { resourceType: string }>(resources: T[]): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((resource) => ({ resource: resource as FhirBundle['entry'] extends Array<infer E> ? E extends { resource: infer R } ? R : never : never })),
  };
}

export const WARAN: FhirMedicationStatement = {
  resourceType: 'MedicationStatement',
  id: 'med-1',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://whocc.no/atc', code: 'B01AA03', display: 'Waran' }],
    text: 'Waran 2.5 mg',
  },
  subject: { reference: `Patient/${SYNTHETIC_PNR}` },
};

export const METFORMIN: FhirMedicationStatement = {
  resourceType: 'MedicationStatement',
  id: 'med-2',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://whocc.no/atc', code: 'A10BA02', display: 'Metformin' }],
    text: 'Metformin 500 mg',
  },
  subject: { reference: `Patient/${SYNTHETIC_PNR}` },
};

export const HIP_REPLACEMENT: FhirProcedure = {
  resourceType: 'Procedure',
  id: 'proc-1',
  status: 'completed',
  code: {
    coding: [{ system: 'http://snomed.info/sct', code: '52734007', display: 'Total replacement of hip' }],
    text: 'Total replacement of hip',
  },
  subject: { reference: `Patient/${SYNTHETIC_PNR}` },
  performedDateTime: '2025-03-15T08:30:00.000Z',
  performer: [{ actor: { reference: 'Practitioner/SE123456789', display: 'Dr. Erik Lindqvist' } }],
  bodySite: [{ coding: [{ system: 'http://snomed.info/sct', code: '24028007', display: 'Right' }] }],
  extension: [
    {
      url: 'https://core.nimloth.io/fhir/StructureDefinition/implant-details',
      extension: [
        { url: 'type', valueString: 'CEMENTED' },
        { url: 'manufacturer', valueString: 'Zimmer Biomet' },
        { url: 'model', valueString: 'Avenir Complete' },
        { url: 'size', valueString: 'Size 3 stem, 52mm cup' },
      ],
    },
  ],
};

export const DVT: FhirCondition = {
  resourceType: 'Condition',
  id: 'cond-1',
  code: {
    coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-se', code: 'I82.4', display: 'DVT i v. poplitea sin' }],
    text: 'DVT i v. poplitea sin',
  },
  subject: { reference: `Patient/${SYNTHETIC_PNR}` },
  onsetDateTime: '2025-03-18T09:00:00.000Z',
};

export const HYPERTENSION: FhirCondition = {
  resourceType: 'Condition',
  id: 'cond-2',
  code: {
    coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-se', code: 'I10', display: 'Essentiell hypertoni' }],
    text: 'Essentiell hypertoni',
  },
  subject: { reference: `Patient/${SYNTHETIC_PNR}` },
};

const PATIENT: FhirPatient = {
  resourceType: 'Patient',
  id: SYNTHETIC_PNR,
  identifier: [{ system: 'http://electronichealth.se/identity/personnummer', value: SYNTHETIC_PNR }],
  name: [{ family: 'Andersson', given: ['Ingrid'] }],
  gender: 'female',
  birthDate: '1950-03-15',
};

/** Prefetch som triggar alla tre demo-regler (antikoagulation, implantat, DVT). */
export function syntheticFruAnderssonPrefetch(): Prefetch {
  return {
    patient: PATIENT,
    medications: bundle([WARAN, METFORMIN]),
    procedures: bundle([HIP_REPLACEMENT]),
    conditions: bundle([DVT, HYPERTENSION]),
  };
}
