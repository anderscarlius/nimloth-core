// Regel: Implantatvarning. Triggas av Procedure med implant-details-extension.

import { randomUUID } from 'node:crypto';
import type { FhirProcedure } from '@nimloth-core/shared/types';
import type { Card, Prefetch } from '../types.js';

const IMPLANT_EXT_URL = 'https://core.nimloth.io/fhir/StructureDefinition/implant-details';

interface ImplantDetails {
  type?: string;
  manufacturer?: string;
  model?: string;
  size?: string;
}

function extractImplantDetails(proc: FhirProcedure): ImplantDetails | null {
  const ext = proc.extension?.find((e) => e.url === IMPLANT_EXT_URL);
  if (!ext?.extension) return null;
  const details: ImplantDetails = {};
  for (const sub of ext.extension) {
    if (sub.url === 'type') details.type = sub.valueString;
    if (sub.url === 'manufacturer') details.manufacturer = sub.valueString;
    if (sub.url === 'model') details.model = sub.valueString;
    if (sub.url === 'size') details.size = sub.valueString;
  }
  return details;
}

export function implantCards(prefetch: Prefetch): Card[] {
  const procedures = (prefetch.procedures?.entry ?? [])
    .map((e) => e.resource as FhirProcedure)
    .filter((p) => p.resourceType === 'Procedure');

  const cards: Card[] = [];
  for (const proc of procedures) {
    const details = extractImplantDetails(proc);
    if (!details) continue;
    const procName = proc.code?.text ?? proc.code?.coding?.[0]?.display ?? 'procedur';
    const bodySite = proc.bodySite?.[0]?.coding?.[0]?.display;
    const when = proc.performedDateTime ? proc.performedDateTime.slice(0, 10) : 'okänt datum';
    const performer = proc.performer?.[0]?.actor?.display ?? 'okänd kirurg';

    const parts = [
      `${procName}${bodySite ? ` (${bodySite} sida)` : ''} utförd ${when}.`,
      details.type ? `Typ: ${details.type}.` : null,
      details.manufacturer ? `Tillverkare: ${details.manufacturer}.` : null,
      details.model ? `Modell: ${details.model}.` : null,
      details.size ? `Storlek: ${details.size}.` : null,
      `Kirurg: ${performer}.`,
      'Vid trauma/fraktur: överväg periprostetisk fraktur — kräver ortopedisk specialistkonsultation.',
    ].filter(Boolean);

    cards.push({
      uuid: randomUUID(),
      summary: `ℹ️ Patienten har implantat: ${procName}${bodySite ? ` (${bodySite})` : ''}`,
      detail: parts.join(' '),
      indicator: 'info',
      source: {
        label: 'Nimloth Core — Implantatregister',
        url: 'https://core.nimloth.io/cds/implants',
      },
    });
  }
  return cards;
}
