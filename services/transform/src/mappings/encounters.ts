import type { Mapper } from '../types.js';
import { tsToIso, toStringOrUndef } from '../types.js';
import { baseEvent } from './helpers.js';

/**
 * Encounters genererar:
 *  - core.clinical.encounter.started vid INSERT
 *  - core.clinical.encounter.ended vid UPDATE där discharge_date satts
 */
export const mapEncounter: Mapper = (raw, ctx) => {
  const data = raw.after;
  if (!data) return null;

  const isEnd = raw.operation === 'UPDATE' && data.discharge_date != null;
  const isStart = raw.operation === 'INSERT' || raw.operation === 'SNAPSHOT';
  if (!isEnd && !isStart) return null;

  const action = isEnd ? 'ENDED' : 'STARTED';
  const topic = isEnd ? 'core.clinical.encounter.ended' : 'core.clinical.encounter.started';
  const base = baseEvent(raw, ctx, topic, toStringOrUndef(data.admitting_doctor_hsa));

  return {
    topic,
    event: {
      ...base,
      payload: {
        action,
        encounter_id: toStringOrUndef(data.encounter_id),
        encounter_type: toStringOrUndef(data.encounter_type) ?? 'OUTPATIENT',
        department_code: toStringOrUndef(data.department_code) ?? '',
        department_name: toStringOrUndef(data.department_name),
        admitting_doctor: toStringOrUndef(data.admitting_doctor_hsa)
          ? {
              hsa_id: String(data.admitting_doctor_hsa),
              name: toStringOrUndef(data.admitting_doctor_name) ?? '',
              role: 'PHYSICIAN',
            }
          : undefined,
        admission_date: tsToIso(data.admission_date) ?? base.timestamp,
        discharge_date: tsToIso(data.discharge_date),
        discharge_diagnosis_icd: toStringOrUndef(data.discharge_diagnosis_icd),
        status: toStringOrUndef(data.status) ?? 'ACTIVE',
      },
    },
  };
};
