// Kafka topic-konstanter för Nimloth Core.
// Matchar create-topics.sh. Importera som TOPICS.clinical.observationVitals osv
// för att undvika typos i producer/consumer-kod.

export const TOPICS = {
  cdc: {
    meliorSu: 'vgr.cdc.melior.su.raw',
    asynja: 'vgr.cdc.asynja.raw',
  },
  clinical: {
    encounterStarted: 'core.clinical.encounter.started',
    encounterEnded: 'core.clinical.encounter.ended',
    observationVitals: 'core.clinical.observation.vitals',
    labResult: 'core.clinical.lab.result',
    medicationPrescribed: 'core.clinical.medication.prescribed',
    medicationDispensed: 'core.clinical.medication.dispensed',
    noteSigned: 'core.clinical.note.signed',
    procedureCompleted: 'core.clinical.procedure.completed',
    referralSent: 'core.clinical.referral.sent',
    conditionDiagnosed: 'core.clinical.condition.diagnosed',
    allergyReported: 'core.clinical.allergy.reported',
  },
  admin: {
    patientRegistered: 'core.admin.patient.registered',
    patientTransferred: 'core.admin.patient.transferred',
    patientDischarged: 'core.admin.patient.discharged',
  },
  audit: {
    access: 'core.audit.access',
  },
  system: {
    qualityMetrics: 'core.system.quality.metrics',
    errors: 'core.system.errors',
    edgeHeartbeat: 'core.system.edge.heartbeat',
  },
  shared: {
    patientIndex: 'core.shared.patient-index',
    sparRegister: 'core.shared.spar-register',
    cdsRules: 'core.shared.cds-rules',
    terminology: 'core.shared.terminology',
  },
} as const;

/** Hämta alla topic-namn som en flat lista. */
export function allTopicNames(): string[] {
  const out: string[] = [];
  const walk = (obj: Record<string, unknown>): void => {
    for (const v of Object.values(obj)) {
      if (typeof v === 'string') out.push(v);
      else if (v && typeof v === 'object') walk(v as Record<string, unknown>);
    }
  };
  walk(TOPICS as unknown as Record<string, unknown>);
  return out;
}
