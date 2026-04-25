// Regel: Antikoagulationsvarning. Triggas av aktiv medication med ATC-prefix B01A.

import { randomUUID } from 'node:crypto';
import type { FhirMedicationStatement } from '@nimloth-core/shared/types';
import type { Card, Prefetch } from '../types.js';

const ATC_ANTITHROMBOTIC_PREFIX = 'B01A';

export function anticoagulationCard(prefetch: Prefetch): Card | null {
  const meds = (prefetch.medications?.entry ?? [])
    .map((e) => e.resource as FhirMedicationStatement)
    .filter((m) => m.resourceType === 'MedicationStatement' && m.status === 'active');

  const hits = meds.filter((m) => {
    const atc = m.medicationCodeableConcept?.coding?.find(
      (c) => c.system === 'http://whocc.no/atc',
    )?.code;
    return atc?.startsWith(ATC_ANTITHROMBOTIC_PREFIX);
  });

  if (hits.length === 0) return null;

  const drugsList = hits
    .map((m) => {
      const text = m.medicationCodeableConcept?.text?.trim();
      if (text) return text;
      const coding = m.medicationCodeableConcept?.coding?.[0];
      return coding?.display ?? coding?.code ?? 'okänt läkemedel';
    })
    .filter((v, i, a) => a.indexOf(v) === i);

  return {
    uuid: randomUUID(),
    summary: '⚠️ Patienten är antikoagulerad',
    detail: `Aktiva antikoagulantia: ${drugsList.join(', ')}. Överväg reversering vid planerad kirurgi. Kontrollera INR och kontakta koagulationskonsult vid behov.`,
    indicator: 'critical',
    source: {
      label: 'Nimloth Core — Antikoagulationsvarning',
      url: 'https://core.nimloth.io/cds/anticoagulation',
    },
    suggestions: [
      {
        label: 'Beställ akut INR-provtagning',
        uuid: randomUUID(),
        actions: [
          {
            type: 'create',
            description: 'Beställ INR (NPU04206)',
            resource: {
              resourceType: 'ServiceRequest',
              status: 'draft',
              intent: 'order',
              code: {
                coding: [
                  {
                    system: 'https://www.npu-terminology.org',
                    code: 'NPU04206',
                    display: 'P-INR',
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}
