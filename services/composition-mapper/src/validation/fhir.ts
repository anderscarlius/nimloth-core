// FHIR R4 MedicationStatement-validering (subset i scope för P4).
//
// Återanvänder INTE @nimloth-core/shared/types/fhir.ts FhirMedicationStatement
// — den är medvetet smal (bara fält som Sprint 1-2-stack-en faktiskt
// producerar). Här validerar vi FHIR R4-spec så att composition-mapper
// kan ta emot externt producerade FHIR-resurser, inte bara våra interna.
//
// Forward-compat: top-level `.passthrough()` släpper igenom okända fält.
// Sub-objekt valideras strikt på de fält vi förlitar oss på.
//
// Spec-referens: FHIR R4 — https://www.hl7.org/fhir/R4/medicationstatement.html
// P4-referens: nimloth-docs/P4_Composition_Mapper.md sektion 4.2

import { z } from 'zod';

// ----- Sub-schemas -----

const FhirCoding = z.object({
  system: z.string().min(1),
  code: z.string().min(1),
  display: z.string().optional(),
});

const FhirCodeableConcept = z.object({
  coding: z.array(FhirCoding).min(1),
  text: z.string().optional(),
});

const FhirCodeableConceptOptional = z.object({
  coding: z.array(FhirCoding).optional(),
  text: z.string().optional(),
});

const FhirReference = z.object({
  reference: z
    .string()
    .regex(
      /^[A-Za-z]+\/[A-Za-z0-9\-\.]+$/,
      'reference must follow ResourceType/id format',
    ),
  display: z.string().optional(),
});

const FhirPatientReference = z.object({
  reference: z
    .string()
    .regex(/^Patient\/[A-Za-z0-9\-\.]+$/, 'subject.reference must be Patient/{id}'),
  display: z.string().optional(),
});

const FhirPeriod = z.object({
  start: z.string().min(1),
  end: z.string().min(1).optional(),
});

const FhirQuantity = z.object({
  value: z.number().optional(),
  unit: z.string().optional(),
  system: z.string().optional(),
  code: z.string().optional(),
  comparator: z.enum(['<', '<=', '>=', '>']).optional(),
});

const DoseAndRate = z
  .object({
    type: FhirCodeableConceptOptional.optional(),
    doseQuantity: FhirQuantity.optional(),
  })
  .passthrough();

const Dosage = z
  .object({
    sequence: z.number().int().optional(),
    text: z.string().optional(),
    timing: z
      .object({
        code: FhirCodeableConceptOptional.optional(),
      })
      .passthrough()
      .optional(),
    route: FhirCodeableConcept.optional(),
    doseAndRate: z.array(DoseAndRate).optional(),
  })
  .passthrough();

// FHIR R4 status-enum för MedicationStatement.
// Källa: https://www.hl7.org/fhir/R4/valueset-medication-statement-status.html
export const MedicationStatementStatus = z.enum([
  'active',
  'completed',
  'entered-in-error',
  'intended',
  'stopped',
  'on-hold',
  'unknown',
  'not-taken',
]);
export type MedicationStatementStatusValue = z.infer<typeof MedicationStatementStatus>;

// ----- Top-level schema -----

export const MedicationStatementSchema = z
  .object({
    resourceType: z.literal('MedicationStatement'),
    id: z.string().optional(),
    status: MedicationStatementStatus,
    medicationCodeableConcept: FhirCodeableConcept,
    subject: FhirPatientReference,
    effectiveDateTime: z.string().min(1).optional(),
    effectivePeriod: FhirPeriod.optional(),
    dosage: z.array(Dosage).optional(),
  })
  .passthrough();

export type MedicationStatement = z.infer<typeof MedicationStatementSchema>;

// ----- Validate-funktion -----

export type ValidationResult =
  | { ok: true; value: MedicationStatement }
  | { ok: false; errors: z.ZodError };

export function validateMedicationStatement(input: unknown): ValidationResult {
  const result = MedicationStatementSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: result.error };
}

/**
 * Lättviktig hjälpare för felrapportering. Tar en `ZodError` och returnerar
 * en lista av `{path, message}`-poster — för loggning eller HTTP 400-body.
 */
export function formatValidationErrors(
  err: z.ZodError,
): Array<{ path: string; message: string }> {
  return err.issues.map((issue) => ({
    path: issue.path.join('.') || '<root>',
    message: issue.message,
  }));
}
