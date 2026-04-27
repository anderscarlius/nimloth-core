import { describe, expect, it } from 'vitest';
import {
  RISK_POLICIES,
  classifyPattern,
  hasPiiColumns,
  hasPatientReference,
  lookupPolicy,
} from '../policies.js';

describe('RISK_POLICIES', () => {
  it('innehåller de fyra primära mönstren', () => {
    expect(RISK_POLICIES.new_enum_value.riskLevel).toBe('low');
    expect(RISK_POLICIES.new_column.riskLevel).toBe('medium');
    expect(RISK_POLICIES.new_table.riskLevel).toBe('medium');
    expect(RISK_POLICIES.new_table_with_pii_no_patient_ref.riskLevel).toBe('high');
    expect(RISK_POLICIES.new_table_with_pii_no_patient_ref.alertOnCall).toBe(true);
  });

  it('low-risk mönster blockerar inte events', () => {
    expect(RISK_POLICIES.new_enum_value.blockEvents).toBe(false);
  });

  it('high-risk mönster autoSuggestar inte (kräver mänskligt initiativ)', () => {
    expect(RISK_POLICIES.new_table_with_pii_no_patient_ref.autoSuggest).toBe(false);
    expect(RISK_POLICIES.unknown.autoSuggest).toBe(false);
  });
});

describe('classifyPattern', () => {
  it('hard-rule: ny tabell med pii-signal utan patient-ref ⇒ high risk', () => {
    expect(
      classifyPattern({
        sourceTable: 'staff_register',
        isNewTable: true,
        hasPiiSignal: true,
        hasPatientRef: false,
        aiPattern: 'new_table',
      }),
    ).toBe('new_table_with_pii_no_patient_ref');
  });

  it('AI-pattern följs när hard-rule inte matchar', () => {
    expect(
      classifyPattern({
        sourceTable: 'lab_orders',
        isNewTable: false,
        aiPattern: 'new_enum_value',
      }),
    ).toBe('new_enum_value');
  });

  it('noise-svar konverteras till unknown (fail-closed)', () => {
    expect(
      classifyPattern({
        sourceTable: 'noisy_log',
        aiPattern: 'noise',
      }),
    ).toBe('unknown');
  });

  it('utan AI-svar faller till heuristik', () => {
    expect(classifyPattern({ sourceTable: 't', isNewTable: true })).toBe('new_table');
    expect(classifyPattern({ sourceTable: 't', isNewColumn: true })).toBe('new_column');
    expect(classifyPattern({ sourceTable: 't' })).toBe('unknown');
  });
});

describe('PII heuristik', () => {
  it('hittar typiska pii-kolumner (svensk vårdkontext)', () => {
    expect(hasPiiColumns(['id', 'personnummer'])).toBe(true);
    expect(hasPiiColumns(['fornamn', 'efternamn'])).toBe(true);
    expect(hasPiiColumns(['adress', 'postnummer'])).toBe(true);
    expect(hasPiiColumns(['epost', 'telefon'])).toBe(true);
    expect(hasPiiColumns(['id', 'created_at'])).toBe(false);
  });

  it('skiljer ut patient-referens', () => {
    expect(hasPatientReference(['patient_id'])).toBe(true);
    expect(hasPatientReference(['patient_pnr'])).toBe(true);
    expect(hasPatientReference(['user_id'])).toBe(false);
  });
});

describe('lookupPolicy', () => {
  it('lookup på unknown ger högsta nivå', () => {
    expect(lookupPolicy('unknown').riskLevel).toBe('high');
    expect(lookupPolicy('unknown').alertOnCall).toBe(true);
  });
});
