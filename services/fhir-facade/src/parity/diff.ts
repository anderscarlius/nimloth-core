// Diff-algoritm (Sprint 2 P3.4, steg 4.3).
//
// Jämför postgres-list vs openehr-list per resurstyp och producerar:
//   - count-diff (abs)
//   - set-diff (canonical-key-strängar, inte raw FHIR-id eftersom id-rymden
//     skiljer sig: postgres = UUID, openehr = composition_uid::version)
//   - field-coverage v1-scope (top-level + code.coding[0].code +
//     valueQuantity.value)
//
// Kanoniseringsregler per resurstyp finns i CANONICAL_KEYS-mappen nedan.
// Vid spec-revision: bumpa KANONISERING_VERSION och uppdatera reglerna.
// Snapshots persisteras med versionen så gamla snapshots inte felaktigt
// jämförs som om de använt nya regler.

import type { ResourceDiff, ResourceType } from './types.js';

/** Versionera kanoniseringsregler. Bumpas när CANONICAL_KEYS ändras. */
export const KANONISERING_VERSION = 1;

/** Hjälpare som extraherar code.coding[0].code från en CodeableConcept-shape. */
function firstCodingCode(c: unknown): string {
  const cc = c as { coding?: Array<{ code?: string }> } | undefined;
  return cc?.coding?.[0]?.code ?? '';
}

/** Hjälpare som extraherar pnr ur en Subject-reference (`Patient/{pnr}`). */
function subjectPnr(r: { subject?: { reference?: string } }): string {
  const ref = r.subject?.reference ?? '';
  return ref.startsWith('Patient/') ? ref.slice('Patient/'.length) : '';
}

/** Kanoniseringsregler per resurstyp. Returnerar en sträng som identifierar
 *  resursen oberoende av store-specifik FHIR-id-rymd. Reglerna baseras på
 *  vår typ-implementation i packages/shared/src/types/fhir.ts. */
type CanonicalKeyFn = (resource: unknown) => string;
const CANONICAL_KEYS: Record<ResourceType, CanonicalKeyFn> = {
  // Patient: id är PNR och identiskt mellan stores.
  Patient: (r) => (r as { id?: string }).id ?? '',

  // Observation: (pnr, code, effectiveDateTime). Fallback (pnr, code, "")
  // — set-diff-brus accepteras för observationer utan datum.
  Observation: (r) => {
    const x = r as { effectiveDateTime?: string; code?: unknown; subject?: { reference?: string } };
    return `${subjectPnr(x)}|${firstCodingCode(x.code)}|${x.effectiveDateTime ?? ''}`;
  },

  // MedicationStatement: (pnr, atc-code, effectivePeriod.start). FhirMedicationStatement
  // har inte effectiveDateTime — bara effectivePeriod (verifierat mot shared/types).
  MedicationStatement: (r) => {
    const x = r as {
      effectivePeriod?: { start?: string };
      medicationCodeableConcept?: unknown;
      subject?: { reference?: string };
    };
    return `${subjectPnr(x)}|${firstCodingCode(x.medicationCodeableConcept)}|${x.effectivePeriod?.start ?? ''}`;
  },

  // Procedure: (pnr, code, performedDateTime). Fallback performedPeriod.start.
  Procedure: (r) => {
    const x = r as {
      performedDateTime?: string;
      performedPeriod?: { start?: string };
      code?: unknown;
      subject?: { reference?: string };
    };
    const time = x.performedDateTime ?? x.performedPeriod?.start ?? '';
    return `${subjectPnr(x)}|${firstCodingCode(x.code)}|${time}`;
  },

  // Condition: (pnr, code, onsetDateTime). Fallback recordedDate. Om båda
  // saknas: (pnr, code, "") — kroniska tillstånd utan datum är normalt.
  Condition: (r) => {
    const x = r as {
      onsetDateTime?: string;
      recordedDate?: string;
      code?: unknown;
      subject?: { reference?: string };
    };
    const time = x.onsetDateTime ?? x.recordedDate ?? '';
    return `${subjectPnr(x)}|${firstCodingCode(x.code)}|${time}`;
  },

  // AllergyIntolerance: (pnr, code, recordedDate). FhirAllergyIntolerance
  // har inte onsetDateTime — bara recordedDate. Subject-fältet heter `patient`
  // (inte `subject`) på den här typen — hanteras nedan.
  AllergyIntolerance: (r) => {
    const x = r as {
      recordedDate?: string;
      code?: unknown;
      patient?: { reference?: string };
    };
    const ref = x.patient?.reference ?? '';
    const pnr = ref.startsWith('Patient/') ? ref.slice('Patient/'.length) : '';
    return `${pnr}|${firstCodingCode(x.code)}|${x.recordedDate ?? ''}`;
  },
};

/** Field-coverage v1-scope: scan alla resurser, räkna populerade fält per
 *  utvald path. v1: top-level fält + code.coding[0].code + valueQuantity.value.
 *  Deep nested skjuts till Sprint 2.5 enligt spec sektion 4.3. */
const COVERAGE_PATHS = ['id', 'code.coding[0].code', 'valueQuantity.value'] as const;

function getCoverageValue(resource: unknown, path: string): boolean {
  const r = resource as Record<string, unknown>;
  if (path === 'id') return typeof r.id === 'string' && r.id.length > 0;
  if (path === 'code.coding[0].code') {
    return firstCodingCode(r.code).length > 0;
  }
  if (path === 'valueQuantity.value') {
    const vq = r.valueQuantity as { value?: number } | undefined;
    return typeof vq?.value === 'number';
  }
  return false;
}

function computeFieldCoverage(
  postgresList: unknown[],
  openehrList: unknown[],
): Record<string, { postgres: number; openehr: number }> {
  const out: Record<string, { postgres: number; openehr: number }> = {};
  for (const path of COVERAGE_PATHS) {
    out[path] = {
      postgres: postgresList.filter((r) => getCoverageValue(r, path)).length,
      openehr: openehrList.filter((r) => getCoverageValue(r, path)).length,
    };
  }
  return out;
}

/** Diff postgres-list vs openehr-list för en resurstyp. Returnerar
 *  ResourceDiff som ParityRunner sätter resource_type + patient_pnr på
 *  innan persistens. */
export function diffResources(
  resourceType: ResourceType,
  postgresList: unknown[],
  openehrList: unknown[],
): ResourceDiff {
  const keyFn = CANONICAL_KEYS[resourceType];
  const postgresKeys = new Set(postgresList.map(keyFn));
  const openehrKeys = new Set(openehrList.map(keyFn));

  const only_in_postgres = [...postgresKeys].filter((k) => !openehrKeys.has(k));
  const only_in_openehr = [...openehrKeys].filter((k) => !postgresKeys.has(k));

  return {
    postgres_count: postgresList.length,
    openehr_count: openehrList.length,
    mismatch_count: Math.abs(postgresList.length - openehrList.length),
    only_in_postgres,
    only_in_openehr,
    field_coverage: computeFieldCoverage(postgresList, openehrList),
  };
}
