// Deterministisk mappning FHIR R4 → openEHR medication_summary.v1.
// Sex pure 1:1-funktioner. Inga async-anrop, inga sidoeffekter, ingen IO.
//
// Returnerar `null` när fältet saknas eller inte kan mappas deterministiskt.
// Caller (4.6 aggregator) avgör om null → human-review-required eller
// LLM-fallback.
//
// Spec-referens: nimloth-docs/P4_Composition_Mapper.md sektion 4.3.

import type { MedicationStatement, MedicationStatementStatusValue } from '../validation/fhir.js';

export interface MappedField<T> {
  value: T;
  confidence: 1.0;
}

const ok = <T>(value: T): MappedField<T> => ({ value, confidence: 1.0 });

// ============================================================
// 1. Medication name + code
// medicationCodeableConcept.coding[0] → composition[0].name + code
// ============================================================
export interface MedicationName {
  name: string;
  code: string;
  system: string;
}

export function mapMedicationName(ms: MedicationStatement): MappedField<MedicationName> | null {
  const coding = ms.medicationCodeableConcept.coding[0];
  if (!coding) return null;
  // display kan saknas — då faller vi tillbaka på code som visningsnamn.
  const name = coding.display ?? coding.code;
  return ok({ name, code: coding.code, system: coding.system });
}

// ============================================================
// 2. Status
// FHIR status → openEHR ISM_TRANSITION-state.
// 5 av 8 är deterministiska; resterande 3 returnerar null.
// ============================================================
const STATUS_MAP: Partial<Record<MedicationStatementStatusValue, string>> = {
  active: 'active',
  completed: 'completed',
  stopped: 'abandoned',
  'on-hold': 'suspended',
  intended: 'planned',
  // 'entered-in-error' → null (kräver clinical reasoning, ej 1:1)
  // 'not-taken' → null (kontextuellt, kan betyda 'planned' ELLER 'abandoned')
  // 'unknown' → null (per definition ej deterministisk)
};

export function mapStatus(ms: MedicationStatement): MappedField<string> | null {
  const mapped = STATUS_MAP[ms.status];
  return mapped ? ok(mapped) : null;
}

// ============================================================
// 3. Start time
// effectiveDateTime ELLER effectivePeriod.start → context.start_time
// ============================================================
export function mapStartTime(ms: MedicationStatement): MappedField<string> | null {
  if (ms.effectiveDateTime) return ok(ms.effectiveDateTime);
  if (ms.effectivePeriod?.start) return ok(ms.effectivePeriod.start);
  return null;
}

// ============================================================
// 4. Route (administrationsväg)
// dosage[0].route (CodeableConcept) → ITEM/DV_CODED_TEXT
// ============================================================
export interface MappedRoute {
  value: string;
  terminology: string;
  code: string;
}

export function mapRoute(ms: MedicationStatement): MappedField<MappedRoute> | null {
  const route = ms.dosage?.[0]?.route;
  if (!route) return null;
  const coding = route.coding[0];
  if (!coding) return null;
  // Återigen — display optional, fall tillbaka på code.
  return ok({
    value: coding.display ?? coding.code,
    terminology: coding.system,
    code: coding.code,
  });
}

// ============================================================
// 5. Sequence
// dosage[0].sequence → composition[0].sequence
// ============================================================
export function mapSequence(ms: MedicationStatement): MappedField<number> | null {
  const sequence = ms.dosage?.[0]?.sequence;
  if (typeof sequence !== 'number') return null;
  return ok(sequence);
}

// ============================================================
// 6. Subject
// subject.reference → composition.subject.party_self.external_ref
// Reference-format är garanterat 'Patient/{id}' efter 4.2-validering.
// ============================================================
export interface MappedSubject {
  namespace: string; // 'patient' (openEHR-konvention)
  type: string; // 'PERSON'
  id: string;
}

export function mapSubject(ms: MedicationStatement): MappedField<MappedSubject> | null {
  const ref = ms.subject.reference;
  // Validering har redan säkerställt 'Patient/{id}'-format. Defensiv split.
  const parts = ref.split('/');
  if (parts.length !== 2 || !parts[1]) return null;
  return ok({ namespace: 'patient', type: 'PERSON', id: parts[1] });
}
