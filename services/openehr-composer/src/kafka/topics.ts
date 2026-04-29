// Topics composern lyssnar på.
//
// OBS: P3.2-specens lista innehöll `core.clinical.medication.statement` som
// inte existerar i create-topics.sh. Verkligheten har `.prescribed` + `.dispensed`
// (det P3.1:s event-mapper redan refererar). Vi använder verkligheten.

export const CLINICAL_TOPICS = [
  'core.clinical.observation.vitals',
  'core.clinical.medication.prescribed',
  'core.clinical.medication.dispensed',
  'core.clinical.allergy.reported',
  'core.clinical.procedure.completed',
  'core.clinical.condition.diagnosed',
] as const;

export const CONSUMER_GROUP = 'core-openehr-composer';
