// Minimal FHIR R4-server (replica-mode) — läser från lokal SQLite-cache.
// Serverar de resurser som dashboarden + CDS-motorn behöver för Fru Andersson-scenariot.
// PDL-headers krävs på alla FHIR-requests.

import express, { type Express, type Request, type Response } from 'express';
import type { Logger } from 'pino';
import type { EdgeConfig } from './config.js';
import type {
  FhirCache,
  PatientRow,
  ObservationRow,
  MedicationRow,
  ConditionRow,
  ProcedureRow,
  AllergyRow,
  EncounterRow,
} from './fhir-cache.js';

const PATIENT_IDENTIFIER_SYSTEM = 'urn:oid:1.2.752.129.2.1.3.1';

export interface FhirServerDeps {
  config: EdgeConfig;
  cache: FhirCache;
  logger: Logger;
}

type FhirResource = Record<string, unknown> & { resourceType: string; id?: string };

function bundle(resources: FhirResource[]): FhirResource {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: resources.length,
    entry: resources.map((resource) => ({ resource })),
  };
}

function renderPatient(row: PatientRow): FhirResource {
  return {
    resourceType: 'Patient',
    id: row.personnummer,
    identifier: [{ system: PATIENT_IDENTIFIER_SYSTEM, value: row.personnummer }],
    active: true,
    name: row.fornamn || row.efternamn
      ? [
          {
            family: row.efternamn ?? undefined,
            given: row.fornamn ? [row.fornamn] : undefined,
            text: [row.fornamn, row.efternamn].filter(Boolean).join(' '),
          },
        ]
      : undefined,
    gender:
      row.kon === 'K' ? 'female' : row.kon === 'M' ? 'male' : 'unknown',
    birthDate: row.fodelsedatum ?? undefined,
    address: row.adress
      ? [
          {
            line: [row.adress],
            postalCode: row.postnr ?? undefined,
            city: row.postort ?? undefined,
            country: 'SE',
          },
        ]
      : undefined,
    telecom: row.telefon ? [{ system: 'phone', value: row.telefon }] : undefined,
    meta: { source: 'edge-replica' },
  };
}

function renderObservation(row: ObservationRow): FhirResource {
  return {
    resourceType: 'Observation',
    id: row.event_id,
    status: 'final',
    category: row.category
      ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: row.category }] }]
      : undefined,
    code: {
      coding: [
        {
          system: row.code_system ?? undefined,
          code: row.code ?? undefined,
          display: row.display ?? undefined,
        },
      ],
      text: row.display ?? undefined,
    },
    subject: { reference: `Patient/${row.patient_pnr}` },
    effectiveDateTime: row.effective_at ?? undefined,
    valueQuantity:
      row.value_numeric != null
        ? { value: row.value_numeric, unit: row.unit ?? undefined }
        : undefined,
    valueString: row.value_text ?? undefined,
    meta: { source: row.source_system ?? 'edge-replica' },
  };
}

function renderMedication(row: MedicationRow): FhirResource {
  return {
    resourceType: 'MedicationStatement',
    id: row.event_id,
    status: row.status ?? 'active',
    medicationCodeableConcept: {
      coding: row.atc_code
        ? [{ system: 'http://www.whocc.no/atc', code: row.atc_code, display: row.drug_name ?? undefined }]
        : undefined,
      text: row.drug_name ?? undefined,
    },
    subject: { reference: `Patient/${row.patient_pnr}` },
    effectivePeriod: row.start_date
      ? { start: row.start_date, end: row.end_date ?? undefined }
      : undefined,
    dosage: row.dosage ? [{ text: row.dosage }] : undefined,
    meta: { source: row.source_system ?? 'edge-replica' },
  };
}

function renderCondition(row: ConditionRow): FhirResource {
  return {
    resourceType: 'Condition',
    id: row.event_id,
    clinicalStatus: { coding: [{ code: 'active' }] },
    code: {
      coding: row.icd_code
        ? [{ system: 'http://hl7.org/fhir/sid/icd-10', code: row.icd_code, display: row.display ?? undefined }]
        : undefined,
      text: row.display ?? undefined,
    },
    category: row.diagnosis_type
      ? [{ coding: [{ code: row.diagnosis_type }] }]
      : undefined,
    subject: { reference: `Patient/${row.patient_pnr}` },
    onsetDateTime: row.onset_at ?? undefined,
    meta: { source: row.source_system ?? 'edge-replica' },
  };
}

function renderProcedure(row: ProcedureRow): FhirResource {
  const extensions: Array<Record<string, unknown>> = [];
  if (row.implant_manufacturer || row.implant_model) {
    extensions.push({
      url: 'urn:core:implant',
      valueString: [row.implant_manufacturer, row.implant_model, row.implant_size]
        .filter(Boolean)
        .join(' · '),
    });
  }
  return {
    resourceType: 'Procedure',
    id: row.event_id,
    status: 'completed',
    code: {
      coding: row.kva_code
        ? [{ system: 'urn:oid:1.2.752.116.1.3.1.1.2.5.2', code: row.kva_code, display: row.display ?? undefined }]
        : undefined,
      text: row.display ?? undefined,
    },
    subject: { reference: `Patient/${row.patient_pnr}` },
    performedDateTime: row.procedure_date ?? undefined,
    bodySite: row.laterality ? [{ text: row.laterality }] : undefined,
    extension: extensions.length > 0 ? extensions : undefined,
    meta: { source: row.source_system ?? 'edge-replica' },
  };
}

function renderAllergy(row: AllergyRow): FhirResource {
  return {
    resourceType: 'AllergyIntolerance',
    id: row.event_id,
    clinicalStatus: { coding: [{ code: 'active' }] },
    code: { text: row.substance ?? undefined },
    criticality:
      row.severity === 'high' ? 'high' : row.severity === 'low' ? 'low' : undefined,
    reaction: row.reaction ? [{ manifestation: [{ text: row.reaction }] }] : undefined,
    patient: { reference: `Patient/${row.patient_pnr}` },
    meta: { source: row.source_system ?? 'edge-replica' },
  };
}

function renderEncounter(row: EncounterRow): FhirResource {
  return {
    resourceType: 'Encounter',
    id: row.encounter_ref,
    status: row.status ?? 'finished',
    class: row.encounter_type ? { code: row.encounter_type } : undefined,
    subject: { reference: `Patient/${row.patient_pnr}` },
    period: row.admission_date
      ? { start: row.admission_date, end: row.discharge_date ?? undefined }
      : undefined,
    serviceProvider: row.department_name ? { display: row.department_name } : undefined,
    meta: { source: row.source_system ?? 'edge-replica' },
  };
}

function requirePdlHeaders(req: Request, res: Response): boolean {
  // Edge replica-mode är stricter runt PDL än dashboardets proxy — varje read
  // måste ha HSA + role + purpose + care-unit. Vårdrelation kan vara false vid
  // nödöppning (purpose=EMERGENCY).
  const required = ['x-user-hsa', 'x-user-role', 'x-pdl-purpose', 'x-pdl-care-unit'];
  const missing = required.filter((h) => !req.header(h));
  if (missing.length > 0) {
    res.status(403).json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'security',
          diagnostics: `Missing PDL headers: ${missing.join(', ')}`,
        },
      ],
    });
    return false;
  }
  const purpose = req.header('x-pdl-purpose');
  const careRelation = req.header('x-pdl-care-relation') === 'true';
  if (!careRelation && purpose !== 'EMERGENCY') {
    res.status(403).json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'security',
          diagnostics: 'Ingen aktiv vårdrelation. Använd X-PDL-Purpose: EMERGENCY för nödöppning.',
        },
      ],
    });
    return false;
  }
  return true;
}

export function createFhirServer(deps: FhirServerDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Health + metadata (ingen PDL)
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'edge-fhir',
      instance_id: deps.config.instanceId,
      fhir_mode: 'replica',
      patients: deps.cache.patientCount(),
    });
  });

  app.get('/fhir/r4/metadata', (_req, res) => {
    res.json({
      resourceType: 'CapabilityStatement',
      status: 'active',
      kind: 'instance',
      fhirVersion: '4.0.1',
      format: ['json'],
      implementation: { description: `Nimloth Core Edge (${deps.config.instanceId})` },
      rest: [
        {
          mode: 'server',
          resource: [
            'Patient',
            'Observation',
            'MedicationStatement',
            'Condition',
            'Procedure',
            'AllergyIntolerance',
            'Encounter',
          ].map((type) => ({
            type,
            interaction: [{ code: 'read' }, { code: 'search-type' }],
          })),
        },
      ],
    });
  });

  // PDL-gate på alla FHIR-rutter
  app.use('/fhir/r4', (req, res, next) => {
    if (requirePdlHeaders(req, res)) next();
  });

  // Patient
  app.get('/fhir/r4/Patient', (req, res): void => {
    const identifier = req.query.identifier as string | undefined;
    if (identifier) {
      const row = deps.cache.findPatientByPnr(identifier);
      res.json(bundle(row ? [renderPatient(row)] : []));
      return;
    }
    const rows = deps.cache.listPatients(50);
    res.json(bundle(rows.map(renderPatient)));
  });

  app.get('/fhir/r4/Patient/:id', (req, res): void => {
    const row = deps.cache.findPatientByPnr(req.params.id);
    if (!row) {
      res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found' }],
      });
      return;
    }
    res.json(renderPatient(row));
  });

  // $everything — $ måste escapas i path-to-regexp
  app.get('/fhir/r4/Patient/:id/\\$everything', (req, res): void => {
    const pnr = req.params.id;
    const data = deps.cache.queryPatientEverything(pnr);
    if (!data.patient) {
      res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found' }],
      });
      return;
    }
    const entries: FhirResource[] = [
      renderPatient(data.patient),
      ...data.encounters.map(renderEncounter),
      ...data.conditions.map(renderCondition),
      ...data.observations.map(renderObservation),
      ...data.medications.map(renderMedication),
      ...data.procedures.map(renderProcedure),
      ...data.allergies.map(renderAllergy),
    ];
    res.json(bundle(entries));
  });

  // Observation
  app.get('/fhir/r4/Observation', (req, res): void => {
    const patient = stripRef(req.query.patient as string | undefined);
    if (!patient) {
      res.json(bundle([]));
      return;
    }
    const data = deps.cache.queryPatientEverything(patient);
    res.json(bundle(data.observations.map(renderObservation)));
  });

  // MedicationStatement
  app.get('/fhir/r4/MedicationStatement', (req, res): void => {
    const patient = stripRef(req.query.patient as string | undefined);
    if (!patient) {
      res.json(bundle([]));
      return;
    }
    const data = deps.cache.queryPatientEverything(patient);
    res.json(bundle(data.medications.map(renderMedication)));
  });

  // Condition
  app.get('/fhir/r4/Condition', (req, res): void => {
    const patient = stripRef(req.query.patient as string | undefined);
    if (!patient) {
      res.json(bundle([]));
      return;
    }
    const data = deps.cache.queryPatientEverything(patient);
    res.json(bundle(data.conditions.map(renderCondition)));
  });

  // Procedure
  app.get('/fhir/r4/Procedure', (req, res): void => {
    const patient = stripRef(req.query.patient as string | undefined);
    if (!patient) {
      res.json(bundle([]));
      return;
    }
    const data = deps.cache.queryPatientEverything(patient);
    res.json(bundle(data.procedures.map(renderProcedure)));
  });

  // AllergyIntolerance
  app.get('/fhir/r4/AllergyIntolerance', (req, res): void => {
    const patient = stripRef(req.query.patient as string | undefined);
    if (!patient) {
      res.json(bundle([]));
      return;
    }
    const data = deps.cache.queryPatientEverything(patient);
    res.json(bundle(data.allergies.map(renderAllergy)));
  });

  // Encounter
  app.get('/fhir/r4/Encounter', (req, res): void => {
    const patient = stripRef(req.query.patient as string | undefined);
    if (!patient) {
      res.json(bundle([]));
      return;
    }
    const data = deps.cache.queryPatientEverything(patient);
    res.json(bundle(data.encounters.map(renderEncounter)));
  });

  return app;
}

function stripRef(ref: string | undefined): string | null {
  if (!ref) return null;
  return ref.startsWith('Patient/') ? ref.slice('Patient/'.length) : ref;
}
