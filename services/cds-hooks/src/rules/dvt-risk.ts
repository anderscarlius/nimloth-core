// Regel: Tidigare venös tromboembolism. Triggas av ICD-10 I80–I82.

import { randomUUID } from 'node:crypto';
import type { FhirCondition } from '@nimloth-core/shared/types';
import type { Card, Prefetch } from '../types.js';

const VTE_ICD_PREFIXES = ['I80', 'I81', 'I82'];

export function dvtCard(prefetch: Prefetch): Card | null {
  const conditions = (prefetch.conditions?.entry ?? [])
    .map((e) => e.resource as FhirCondition)
    .filter((c) => c.resourceType === 'Condition');

  const hits = conditions.filter((c) => {
    const icd = c.code?.coding?.find(
      (co) => co.system === 'http://hl7.org/fhir/sid/icd-10-se' || co.system?.includes('icd-10'),
    )?.code;
    return icd && VTE_ICD_PREFIXES.some((p) => icd.startsWith(p));
  });

  if (hits.length === 0) return null;

  const details = hits.map((c) => {
    const display = c.code?.text ?? c.code?.coding?.[0]?.display ?? c.code?.coding?.[0]?.code ?? 'okänd';
    const when = c.onsetDateTime ? c.onsetDateTime.slice(0, 10) : 'okänt datum';
    return `${display} (${when})`;
  });

  return {
    uuid: randomUUID(),
    summary: 'ℹ️ Tidigare venös tromboembolism',
    detail: `Registrerad VTE-historik: ${details.join(', ')}. Utökad trombosprofylax rekommenderas vid ny immobilisering, kirurgi eller akut sjukdom.`,
    indicator: 'info',
    source: {
      label: 'Nimloth Core — Trombosrisk',
      url: 'https://core.nimloth.io/cds/dvt-risk',
    },
  };
}
