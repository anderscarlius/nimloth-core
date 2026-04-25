// Ajv-setup + validator-fabriker för alla JSON Schemas.
// Scheman importeras som statisk JSON (TypeScript NodeNext + resolveJsonModule).

import type { ValidateFunction } from 'ajv';
import AjvModule from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

import baseEventSchema from './base-event.schema.json' with { type: 'json' };
import vitalsSchema from './vitals.schema.json' with { type: 'json' };
import labResultSchema from './lab-result.schema.json' with { type: 'json' };
import medicationSchema from './medication.schema.json' with { type: 'json' };
import procedureSchema from './procedure.schema.json' with { type: 'json' };
import conditionSchema from './condition.schema.json' with { type: 'json' };
import allergySchema from './allergy.schema.json' with { type: 'json' };
import encounterSchema from './encounter.schema.json' with { type: 'json' };
import noteSchema from './note.schema.json' with { type: 'json' };
import referralSchema from './referral.schema.json' with { type: 'json' };
import auditSchema from './audit.schema.json' with { type: 'json' };

export const SCHEMA_VERSION = '1.0.0';

// ------------------------------------------------------------
// Ajv-interop: ajv är CJS men vi importerar via ESM.
// Unwrap:a default-wrapping som kan uppstå beroende på Node-loader.
// ------------------------------------------------------------
type AjvCtor = new (opts?: Record<string, unknown>) => {
  addSchema(schema: unknown, key?: string): void;
  compile(schema: unknown): ValidateFunction;
};

const Ajv2020 = ((AjvModule as unknown as { default?: AjvCtor }).default ?? AjvModule) as AjvCtor;
const addFormats = ((addFormatsModule as unknown as { default?: (ajv: unknown) => void }).default
  ?? addFormatsModule) as (ajv: unknown) => void;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

// Registrera base-event så andra scheman kan $ref:a den
ajv.addSchema(baseEventSchema, 'base-event.schema.json');

// ------------------------------------------------------------
// Validator-fabriker per event-typ
// ------------------------------------------------------------
export const validators = {
  vitals: ajv.compile(vitalsSchema),
  labResult: ajv.compile(labResultSchema),
  medication: ajv.compile(medicationSchema),
  procedure: ajv.compile(procedureSchema),
  condition: ajv.compile(conditionSchema),
  allergy: ajv.compile(allergySchema),
  encounter: ajv.compile(encounterSchema),
  note: ajv.compile(noteSchema),
  referral: ajv.compile(referralSchema),
  audit: ajv.compile(auditSchema),
};

export type ValidatorName = keyof typeof validators;

/** Validera ett event mot ett namngivet schema. Returnerar { ok, errors }. */
export function validateEvent(
  name: ValidatorName,
  data: unknown,
): { ok: boolean; errors: string[] } {
  const v = validators[name];
  const ok = v(data) as boolean;
  const errors = (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
  return { ok, errors };
}

// Re-export av råa schemas om någon behöver inspektera dem
export {
  baseEventSchema,
  vitalsSchema,
  labResultSchema,
  medicationSchema,
  procedureSchema,
  conditionSchema,
  allergySchema,
  encounterSchema,
  noteSchema,
  referralSchema,
  auditSchema,
};

export * from './topics.js';
