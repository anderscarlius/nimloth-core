// AqlToFhir — mappar AQL-rows till FHIR-resurser.
//
// Designprinciper:
//   - Strict typade signaturer: ingen `any` exponerat
//   - Loggar fält som returnerade null/undefined via CoverageTracker
//   - Tillämpar klient-sida-filter där EHRbases AQL-syntax är begränsad
//     (t.ex. archetype_node_id-prefix för EVALUATION-templates)

import type {
  FhirPatient,
  FhirObservation,
  FhirMedicationStatement,
  FhirProcedure,
  FhirCondition,
} from '@nimloth-core/shared/types';
import type { AqlResult } from './ehrbase-aql-client.js';
import type { CoverageTracker } from './coverage-tracker.js';

const PATIENT_IDENTIFIER_SYSTEM = 'urn:oid:1.2.752.129.2.1.3.1';

interface DvQuantity {
  _type?: 'DV_QUANTITY';
  magnitude?: number;
  units?: string;
}

export class AqlToFhir {
  constructor(private readonly coverage: CoverageTracker) {}

  toPatient(result: AqlResult, pnr: string): FhirPatient | null {
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const ehrId = row[0] as string | null;
    const created = row[2] as string | null;

    if (!ehrId) {
      this.coverage.logMissingField('Patient', 'ehr_id');
      return null;
    }

    // openEHR EHR_STATUS exponerar inte namn/födelsedatum/kön.
    // Logga dessa som saknade — i framtiden kommer demographics-arketyper.
    this.coverage.logMissingField('Patient', 'name', `ehr:${ehrId}`);
    this.coverage.logMissingField('Patient', 'birthDate', `ehr:${ehrId}`);
    this.coverage.logMissingField('Patient', 'gender', `ehr:${ehrId}`);

    return {
      resourceType: 'Patient',
      id: pnr,
      meta: {
        versionId: '1',
        lastUpdated: created ?? undefined,
        source: `openehr-ehr:${ehrId}`,
      },
      identifier: [{ system: PATIENT_IDENTIFIER_SYSTEM, value: pnr }],
      active: true,
    };
  }

  toObservations(result: AqlResult, patientPnr: string): FhirObservation[] {
    return result.rows
      .map((row) => this.rowToObservation(row, patientPnr))
      .filter((obs): obs is FhirObservation => obs !== null);
  }

  private rowToObservation(row: unknown[], patientPnr: string): FhirObservation | null {
    const compositionUid = row[0] as string | null;
    const effectiveTime = row[1] as string | null;
    const templateId = row[2] as string | null;
    const archetypeNodeId = row[3] as string | null;
    const value = row[4] as DvQuantity | null;

    if (!compositionUid) {
      this.coverage.logMissingField('Observation', 'id');
      return null;
    }

    const obs: FhirObservation = {
      resourceType: 'Observation',
      id: compositionUid.split('::')[0],
      status: 'final',
      subject: { reference: `Patient/${patientPnr}` },
      meta: {
        versionId: '1',
        source: templateId ? `openehr-template:${templateId}` : `openehr-ehr`,
      },
      code: archetypeNodeId
        ? {
            coding: [
              { system: 'http://openehr.org/archetypes', code: archetypeNodeId },
            ],
          }
        : { coding: [] },
      effectiveDateTime: effectiveTime ?? undefined,
    };

    if (!archetypeNodeId) {
      this.coverage.logMissingField('Observation', 'code', compositionUid);
    }

    if (value && typeof value === 'object' && 'magnitude' in value) {
      obs.valueQuantity = {
        value: value.magnitude,
        unit: value.units,
      };
    } else if (value != null) {
      this.coverage.logMissingField('Observation', 'value.unexpected_shape', String(archetypeNodeId));
    } else {
      this.coverage.logMissingField('Observation', 'value', String(archetypeNodeId));
    }

    return obs;
  }

  toMedicationStatements(result: AqlResult, patientPnr: string): FhirMedicationStatement[] {
    // EVALUATION-filter görs klient-sida: bara archetype_node_id som börjar
    // med 'openEHR-EHR-EVALUATION.medication'. Sprint 2 returnerar tom array.
    return result.rows
      .filter((row) => {
        const archetypeNodeId = row[3] as string | null;
        return archetypeNodeId?.startsWith('openEHR-EHR-EVALUATION.medication') ?? false;
      })
      .map((row) => this.rowToMedicationStatement(row, patientPnr))
      .filter((m): m is FhirMedicationStatement => m !== null);
  }

  private rowToMedicationStatement(row: unknown[], patientPnr: string): FhirMedicationStatement | null {
    const compositionUid = row[0] as string | null;
    const effectiveTime = row[1] as string | null;
    const templateId = row[2] as string | null;
    if (!compositionUid) return null;

    // Detaljerad data-extraktion kommer i P3.0b när EVALUATION-arketyperna
    // är komponerade. Tills dess: minimal MedicationStatement-shell.
    this.coverage.logMissingField('MedicationStatement', 'medicationCodeableConcept', compositionUid);

    return {
      resourceType: 'MedicationStatement',
      id: compositionUid.split('::')[0],
      status: 'active',
      subject: { reference: `Patient/${patientPnr}` },
      meta: { source: templateId ? `openehr-template:${templateId}` : 'openehr-ehr' },
      effectivePeriod: effectiveTime ? { start: effectiveTime } : undefined,
      medicationCodeableConcept: { coding: [], text: '(unknown — P3.0b kommer fylla)' },
    };
  }

  toProcedures(result: AqlResult, patientPnr: string): FhirProcedure[] {
    return result.rows
      .map((row) => this.rowToProcedure(row, patientPnr))
      .filter((p): p is FhirProcedure => p !== null);
  }

  private rowToProcedure(row: unknown[], patientPnr: string): FhirProcedure | null {
    const compositionUid = row[0] as string | null;
    const effectiveTime = row[1] as string | null;
    const templateId = row[2] as string | null;
    const description = row[4] as { _type?: string; value?: string } | string | null;

    if (!compositionUid) return null;

    const text =
      typeof description === 'string'
        ? description
        : description && typeof description === 'object' && 'value' in description
          ? (description.value as string)
          : null;

    if (!text) this.coverage.logMissingField('Procedure', 'code.text', compositionUid);

    return {
      resourceType: 'Procedure',
      id: compositionUid.split('::')[0],
      status: 'completed',
      subject: { reference: `Patient/${patientPnr}` },
      meta: { source: templateId ? `openehr-template:${templateId}` : 'openehr-ehr' },
      performedDateTime: effectiveTime ?? undefined,
      code: text ? { text } : { coding: [] },
    };
  }

  toConditions(result: AqlResult, patientPnr: string): FhirCondition[] {
    return result.rows
      .filter((row) => {
        const archetypeNodeId = row[3] as string | null;
        return archetypeNodeId?.startsWith('openEHR-EHR-EVALUATION.problem') ?? false;
      })
      .map((row) => this.rowToCondition(row, patientPnr))
      .filter((c): c is FhirCondition => c !== null);
  }

  private rowToCondition(row: unknown[], patientPnr: string): FhirCondition | null {
    const compositionUid = row[0] as string | null;
    const effectiveTime = row[1] as string | null;
    const templateId = row[2] as string | null;
    if (!compositionUid) return null;

    this.coverage.logMissingField('Condition', 'code', compositionUid);

    return {
      resourceType: 'Condition',
      id: compositionUid.split('::')[0],
      subject: { reference: `Patient/${patientPnr}` },
      meta: { source: templateId ? `openehr-template:${templateId}` : 'openehr-ehr' },
      recordedDate: effectiveTime ?? undefined,
      code: { coding: [], text: '(unknown — P3.0b kommer fylla)' },
    };
  }
}
