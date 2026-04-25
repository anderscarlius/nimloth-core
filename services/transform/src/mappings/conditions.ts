import type { Mapper } from '../types.js';
import { tsToIso, toStringOrUndef } from '../types.js';
import { SYS, DIAGNOSIS_TYPE_SNOMED } from '../terminology.js';
import { baseEvent } from './helpers.js';

export const mapCondition: Mapper = (raw, ctx) => {
  if (raw.operation === 'DELETE') return null;
  const data = raw.after;
  if (!data) return null;

  const icd = toStringOrUndef(data.icd_code) ?? '';
  const diagType = toStringOrUndef(data.diagnosis_type) ?? 'PRIMARY';
  const diagTypeSnomed = DIAGNOSIS_TYPE_SNOMED[diagType];

  const base = baseEvent(
    raw,
    ctx,
    'core.clinical.condition.diagnosed',
    toStringOrUndef(data.diagnosed_by_hsa),
  );

  return {
    topic: 'core.clinical.condition.diagnosed',
    event: {
      ...base,
      payload: {
        diagnosis: {
          system: SYS.icd10se,
          code: icd,
          display: toStringOrUndef(data.diagnosis_text) ?? icd,
        },
        icd_code: icd,
        diagnosis_text: toStringOrUndef(data.diagnosis_text),
        diagnosis_type: diagType,
        diagnosis_type_snomed: diagTypeSnomed
          ? { system: SYS.snomed, ...diagTypeSnomed }
          : undefined,
        diagnosed_by: toStringOrUndef(data.diagnosed_by_hsa)
          ? { hsa_id: String(data.diagnosed_by_hsa), name: '', role: 'PHYSICIAN' }
          : undefined,
        diagnosed_at: tsToIso(data.diagnosed_at) ?? base.timestamp,
        resolved_at: tsToIso(data.resolved_at),
        encounter_id: toStringOrUndef(data.encounter_id),
      },
    },
  };
};
