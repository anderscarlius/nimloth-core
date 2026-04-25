import type { Mapper } from '../types.js';
import { tsToIso, toStringOrUndef } from '../types.js';
import { SYS, allergenToSnomed } from '../terminology.js';
import { baseEvent } from './helpers.js';

export const mapAllergy: Mapper = (raw, ctx) => {
  if (raw.operation === 'DELETE') return null;
  const data = raw.after;
  if (!data) return null;

  const allergen = toStringOrUndef(data.allergen) ?? '';
  const snomed = allergenToSnomed(allergen);

  const base = baseEvent(
    raw,
    ctx,
    'core.clinical.allergy.reported',
    toStringOrUndef(data.reported_by_hsa),
  );

  return {
    topic: 'core.clinical.allergy.reported',
    event: {
      ...base,
      payload: {
        allergen,
        allergen_coded: snomed ? { system: SYS.snomed, ...snomed } : undefined,
        reaction: toStringOrUndef(data.reaction),
        severity: toStringOrUndef(data.severity) ?? 'MODERATE',
        verified: Boolean(data.verified),
        reported_by: toStringOrUndef(data.reported_by_hsa)
          ? { hsa_id: String(data.reported_by_hsa), name: '', role: 'PHYSICIAN' }
          : undefined,
        reported_at: tsToIso(data.reported_at) ?? base.timestamp,
      },
    },
  };
};
