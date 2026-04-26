import type { Mapper } from '../types.js';
import { tsToIso, toNumberOrNull, toStringOrUndef } from '../types.js';
import { SYS, VITALS_SNOMED, VITALS_BP_COMPONENTS, toUcum } from '../terminology-client.js';
import { rangeCheck, type QualityFlag } from '../quality.js';
import { baseEvent } from './helpers.js';

export const mapVitals: Mapper = (raw, ctx) => {
  if (raw.operation === 'DELETE') return null;
  const data = raw.after;
  if (!data) return null;

  const type = (data.observation_type as string) ?? '';
  const v1 = toNumberOrNull(data.value_numeric);
  const v2 = toNumberOrNull(data.value_numeric2);
  const unit = toUcum((data.unit as string) ?? '');
  const recordedBy = toStringOrUndef(data.recorded_by_hsa);

  const values: Array<{ system: string; code: string; display: string; value: number | null; unit: string }> = [];
  if (type === 'BLOOD_PRESSURE') {
    values.push({
      system: SYS.snomed,
      code: VITALS_BP_COMPONENTS.systolic.code,
      display: VITALS_BP_COMPONENTS.systolic.display,
      value: v1,
      unit: unit || 'mm[Hg]',
    });
    values.push({
      system: SYS.snomed,
      code: VITALS_BP_COMPONENTS.diastolic.code,
      display: VITALS_BP_COMPONENTS.diastolic.display,
      value: v2,
      unit: unit || 'mm[Hg]',
    });
  } else {
    const snomed = VITALS_SNOMED[type];
    values.push({
      system: SYS.snomed,
      code: snomed?.code ?? '',
      display: snomed?.display ?? type,
      value: v1,
      unit,
    });
  }

  const flags: QualityFlag[] = [];
  const r = rangeCheck(type, v1);
  if (r) flags.push(r);
  if (type === 'BLOOD_PRESSURE' && v2 == null) flags.push('MISSING_DIASTOLIC');
  if (!unit) flags.push('MISSING_UNIT');
  for (const f of flags) ctx.metrics.recordFlag(f);

  const base = baseEvent(raw, ctx, 'core.clinical.observation.vitals', recordedBy);
  return {
    topic: 'core.clinical.observation.vitals',
    event: {
      ...base,
      payload: {
        observation_type: type,
        values,
        recorded_by: { hsa_id: recordedBy ?? '', name: '', role: 'PHYSICIAN' },
        recorded_at: tsToIso(data.recorded_at) ?? base.timestamp,
        encounter_id: toStringOrUndef(data.encounter_id),
        quality_flags: flags,
      },
    },
  };
};
