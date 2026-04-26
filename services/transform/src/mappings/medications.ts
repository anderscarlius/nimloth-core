import type { Mapper } from '../types.js';
import { dateToIso, toStringOrUndef } from '../types.js';
import { SYS } from '../terminology-client.js';
import { baseEvent } from './helpers.js';

export const mapMedication: Mapper = (raw, ctx) => {
  if (raw.operation === 'DELETE') return null;
  const data = raw.after;
  if (!data) return null;

  const action = raw.operation === 'UPDATE' ? 'PRESCRIBED' : 'PRESCRIBED';
  const base = baseEvent(
    raw,
    ctx,
    'core.clinical.medication.prescribed',
    toStringOrUndef(data.prescribing_doctor_hsa),
  );

  return {
    topic: 'core.clinical.medication.prescribed',
    event: {
      ...base,
      payload: {
        action,
        medication: {
          system: SYS.atc,
          code: toStringOrUndef(data.atc_code) ?? '',
          display: toStringOrUndef(data.drug_name) ?? '',
        },
        drug_name: toStringOrUndef(data.drug_name),
        atc_code: toStringOrUndef(data.atc_code),
        strength: toStringOrUndef(data.strength),
        dosage: toStringOrUndef(data.dosage),
        route: toStringOrUndef(data.route),
        frequency: toStringOrUndef(data.frequency),
        start_date: dateToIso(data.start_date),
        end_date: dateToIso(data.end_date),
        prescribed_by: toStringOrUndef(data.prescribing_doctor_hsa)
          ? { hsa_id: String(data.prescribing_doctor_hsa), name: '', role: 'PHYSICIAN' }
          : { hsa_id: '', name: '', role: 'PHYSICIAN' },
        status: toStringOrUndef(data.status) ?? 'ACTIVE',
        encounter_id: toStringOrUndef(data.encounter_id),
      },
    },
  };
};
