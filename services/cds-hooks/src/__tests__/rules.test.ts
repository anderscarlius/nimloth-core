// CDS-regler testade med syntetiska FHIR-bundles.

import { describe, expect, it } from 'vitest';
import type { FhirBundle, FhirCondition, FhirMedicationStatement, FhirProcedure } from '@nimloth-core/shared/types';
import { anticoagulationCard } from '../rules/anticoagulation.js';
import { implantCards } from '../rules/implant-alert.js';
import { dvtCard } from '../rules/dvt-risk.js';
import { runAllRules } from '../rules/index.js';
import { sortCards } from '../types.js';
import type { Prefetch } from '../types.js';

function bundle<T>(resources: T[]): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((r) => ({ resource: r as unknown as FhirBundle['entry'] extends Array<infer E> ? E extends { resource: infer R } ? R : never : never })),
  };
}

// ----- Fixtures -----
const WARAN: FhirMedicationStatement = {
  resourceType: 'MedicationStatement',
  id: 'med-1',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://whocc.no/atc', code: 'B01AA03', display: 'Waran' }],
    text: 'Waran 2.5 mg',
  },
  subject: { reference: 'Patient/19500315-2384' },
};

const METFORMIN: FhirMedicationStatement = {
  resourceType: 'MedicationStatement',
  id: 'med-2',
  status: 'active',
  medicationCodeableConcept: {
    coding: [{ system: 'http://whocc.no/atc', code: 'A10BA02', display: 'Metformin' }],
    text: 'Metformin 500 mg',
  },
  subject: { reference: 'Patient/19500315-2384' },
};

const HIP_REPLACEMENT: FhirProcedure = {
  resourceType: 'Procedure',
  id: 'proc-1',
  status: 'completed',
  code: {
    coding: [{ system: 'http://snomed.info/sct', code: '52734007', display: 'Total replacement of hip' }],
    text: 'Total replacement of hip',
  },
  subject: { reference: 'Patient/19500315-2384' },
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

const DVT: FhirCondition = {
  resourceType: 'Condition',
  id: 'cond-1',
  code: {
    coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-se', code: 'I82.4', display: 'DVT i v. poplitea sin' }],
    text: 'DVT i v. poplitea sin',
  },
  subject: { reference: 'Patient/19500315-2384' },
  onsetDateTime: '2025-03-18T09:00:00.000Z',
};

const HYPERTENSION: FhirCondition = {
  resourceType: 'Condition',
  id: 'cond-2',
  code: {
    coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-se', code: 'I10', display: 'Essentiell hypertoni' }],
    text: 'Essentiell hypertoni',
  },
  subject: { reference: 'Patient/19500315-2384' },
};

// ============================================================
describe('Fru Andersson-scenariot', () => {
  const prefetch: Prefetch = {
    medications: bundle([WARAN, METFORMIN]),
    procedures: bundle([HIP_REPLACEMENT]),
    conditions: bundle([DVT, HYPERTENSION]),
  };

  it('alla tre regler triggar', () => {
    const cards = runAllRules(prefetch);
    expect(cards).toHaveLength(3);
    const summaries = cards.map((c) => c.summary);
    expect(summaries.some((s) => s.includes('antikoagulerad'))).toBe(true);
    expect(summaries.some((s) => s.includes('implantat'))).toBe(true);
    expect(summaries.some((s) => s.includes('tromboembolism'))).toBe(true);
  });

  it('antikoagulation blir critical', () => {
    const card = anticoagulationCard(prefetch);
    expect(card?.indicator).toBe('critical');
    expect(card?.detail).toContain('Waran');
  });

  it('implantat-card innehåller Zimmer Biomet-modell', () => {
    const cards = implantCards(prefetch);
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('Zimmer Biomet');
    expect(cards[0].detail).toContain('Avenir Complete');
    expect(cards[0].detail).toContain('Right');
  });

  it('DVT-card triggar på I82.4', () => {
    const card = dvtCard(prefetch);
    expect(card?.indicator).toBe('info');
    expect(card?.detail).toContain('DVT');
  });

  it('sorterar critical först', () => {
    const sorted = sortCards(runAllRules(prefetch));
    expect(sorted[0].indicator).toBe('critical');
    expect(sorted.slice(1).every((c) => c.indicator === 'info')).toBe(true);
  });
});

describe('Frisk patient', () => {
  const prefetch: Prefetch = {
    medications: bundle([METFORMIN]),
    procedures: bundle([]),
    conditions: bundle([HYPERTENSION]),
  };

  it('ger inga cards', () => {
    const cards = runAllRules(prefetch);
    expect(cards).toHaveLength(0);
  });
});

describe('Endast antikoagulation', () => {
  const prefetch: Prefetch = {
    medications: bundle([WARAN]),
    procedures: bundle([]),
    conditions: bundle([]),
  };

  it('ger exakt ett critical card', () => {
    const cards = runAllRules(prefetch);
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
  });
});

describe('Tom prefetch', () => {
  it('ger inga cards', () => {
    expect(runAllRules({})).toHaveLength(0);
  });
});
