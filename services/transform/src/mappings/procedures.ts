import type { Mapper } from '../types.js';
import { tsToIso, toStringOrUndef, toNumberOrNull } from '../types.js';
import { SYS, kvaToSnomed } from '../terminology-client.js';
import { baseEvent } from './helpers.js';

export const mapProcedure: Mapper = (raw, ctx) => {
  if (raw.operation === 'DELETE') return null;
  const data = raw.after;
  if (!data) return null;

  const kva = (data.procedure_code_kva as string) ?? '';
  const snomed = kvaToSnomed(kva);
  const base = baseEvent(
    raw,
    ctx,
    'core.clinical.procedure.completed',
    toStringOrUndef(data.performing_surgeon_hsa),
  );

  return {
    topic: 'core.clinical.procedure.completed',
    event: {
      ...base,
      payload: {
        procedure: snomed
          ? { system: SYS.snomed, code: snomed.code, display: snomed.display }
          : { system: SYS.kva, code: kva, display: toStringOrUndef(data.procedure_name) ?? kva },
        procedure_code_kva: kva,
        procedure_name: toStringOrUndef(data.procedure_name),
        laterality: toStringOrUndef(data.laterality),
        implant: data.implant_type || data.implant_manufacturer
          ? {
              type: toStringOrUndef(data.implant_type),
              manufacturer: toStringOrUndef(data.implant_manufacturer),
              model: toStringOrUndef(data.implant_model),
              size: toStringOrUndef(data.implant_size),
            }
          : undefined,
        performer: toStringOrUndef(data.performing_surgeon_hsa)
          ? {
              hsa_id: String(data.performing_surgeon_hsa),
              name: toStringOrUndef(data.performing_surgeon_name) ?? '',
              role: 'PHYSICIAN',
            }
          : { hsa_id: '', name: '', role: 'PHYSICIAN' },
        procedure_date: tsToIso(data.procedure_date) ?? base.timestamp,
        duration_minutes: toNumberOrNull(data.duration_minutes) ?? undefined,
        anesthesia_type: toStringOrUndef(data.anesthesia_type),
        complications: toStringOrUndef(data.complications),
        encounter_id: toStringOrUndef(data.encounter_id),
      },
    },
  };
};
