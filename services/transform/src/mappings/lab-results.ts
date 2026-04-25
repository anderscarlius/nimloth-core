import type { Mapper } from '../types.js';
import { tsToIso, toNumberOrNull, toStringOrUndef } from '../types.js';
import { SYS, npuToLoinc, toUcum } from '../terminology.js';
import type { QualityFlag } from '../quality.js';
import { baseEvent } from './helpers.js';

export const mapLabResult: Mapper = (raw, ctx) => {
  if (raw.operation === 'DELETE') return null;
  const data = raw.after;
  if (!data) return null;

  const npu = (data.analysis_code as string) ?? '';
  const loinc = npuToLoinc(npu);
  const flags: QualityFlag[] = [];
  if (!loinc) flags.push('UNKNOWN_CODE');
  if (data.value_numeric == null && data.value_text == null) flags.push('MISSING_VALUE');
  if (data.reference_low == null && data.reference_high == null) flags.push('MISSING_REFERENCE');
  for (const f of flags) ctx.metrics.recordFlag(f);

  const base = baseEvent(
    raw,
    ctx,
    'core.clinical.lab.result',
    toStringOrUndef(data.ordering_doctor_hsa),
  );
  return {
    topic: 'core.clinical.lab.result',
    event: {
      ...base,
      payload: {
        order_id: toStringOrUndef(data.order_id),
        analysis: loinc
          ? { system: SYS.loinc, code: loinc.code, display: loinc.display }
          : { system: SYS.npu, code: npu, display: toStringOrUndef(data.analysis_name) ?? npu },
        result: {
          value_numeric: toNumberOrNull(data.value_numeric),
          value_text: toStringOrUndef(data.value_text),
          unit: toUcum((data.unit as string) ?? ''),
          reference_low: toNumberOrNull(data.reference_low),
          reference_high: toNumberOrNull(data.reference_high),
          flag: toStringOrUndef(data.flag),
        },
        ordering_doctor: toStringOrUndef(data.ordering_doctor_hsa)
          ? { hsa_id: String(data.ordering_doctor_hsa), name: '', role: 'PHYSICIAN' }
          : undefined,
        lab_system_code: toStringOrUndef(data.lab_system_code),
        sample_collected_at: tsToIso(data.sample_collected_at),
        result_available_at: tsToIso(data.result_available_at) ?? base.timestamp,
        encounter_id: toStringOrUndef(data.encounter_id),
        quality_flags: flags,
      },
    },
  };
};
