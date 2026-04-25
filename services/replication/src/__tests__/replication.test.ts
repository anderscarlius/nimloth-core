// Vitest-tester för replication-tjänsten.
// Tester som INTE kräver Kafka/Postgres live — pure functions + logic.

import { describe, it, expect } from 'vitest';
import { stripEdgePrefix } from '../edge-aggregator.js';
import { buildPatientIndexMessage } from '../shared-distributor.js';
import { ConflictResolver, type ConflictRecord } from '../conflict-resolver.js';

describe('EdgeEventAggregator / stripEdgePrefix', () => {
  it('strippar prefix för kliniska topics', () => {
    expect(stripEdgePrefix('edge-su.core.clinical.lab.result')).toEqual({
      edge: 'su',
      central: 'core.clinical.lab.result',
    });
    expect(stripEdgePrefix('edge-skas.core.clinical.observation.vitals')).toEqual({
      edge: 'skas',
      central: 'core.clinical.observation.vitals',
    });
    expect(stripEdgePrefix('edge-su.core.audit.access')).toEqual({
      edge: 'su',
      central: 'core.audit.access',
    });
  });

  it('returnerar null för centrala topics (utan edge-prefix)', () => {
    expect(stripEdgePrefix('core.clinical.lab.result')).toBeNull();
    expect(stripEdgePrefix('core.shared.patient-index')).toBeNull();
  });

  it('returnerar null för malformerade topics', () => {
    expect(stripEdgePrefix('edge-.core.clinical.lab.result')).toBeNull();
    expect(stripEdgePrefix('random.topic')).toBeNull();
  });
});

describe('SharedDataDistributor / buildPatientIndexMessage', () => {
  it('konstruerar korrekt patientindex från DB-rad', () => {
    const msg = buildPatientIndexMessage({
      personnummer: '19500315-2384',
      fornamn: 'Ingrid',
      efternamn: 'Andersson',
      fodelsedatum: '1950-03-15',
      kon: 'K',
      source_systems: ['melior-su', 'asynja'],
      updated_at: '2026-04-22T10:00:00Z',
    });
    expect(msg.personnummer).toBe('19500315-2384');
    expect(msg.name).toBe('Ingrid Andersson');
    expect(msg.birth_date).toBe('1950-03-15');
    expect(msg.gender).toBe('K');
    expect(msg.source_systems).toEqual(['melior-su', 'asynja']);
  });

  it('faller tillbaka till pnr som name om namn saknas', () => {
    const msg = buildPatientIndexMessage({
      personnummer: '19500315-2384',
      fornamn: null,
      efternamn: null,
      fodelsedatum: null,
      kon: null,
      source_systems: null,
      updated_at: new Date('2026-04-22'),
    });
    expect(msg.name).toBe('19500315-2384');
    expect(msg.source_systems).toEqual([]);
    expect(msg.birth_date).toBeNull();
  });

  it('trimmar Date → YYYY-MM-DD', () => {
    const msg = buildPatientIndexMessage({
      personnummer: '19500315-2384',
      fornamn: 'I',
      efternamn: 'A',
      fodelsedatum: new Date(Date.UTC(1950, 2, 15)),
      kon: 'K',
      source_systems: [],
      updated_at: new Date(),
    });
    expect(msg.birth_date).toBe('1950-03-15');
  });
});

describe('ConflictResolver', () => {
  const resolver = new ConflictResolver();

  const melior: ConflictRecord = {
    factKey: 'allergy:Penicillin',
    timestamp: '2025-03-15T10:00:00Z',
    source_system: 'melior-su',
    payload: { substance: 'Penicillin', severity: 'moderate', reaction: 'Urtikaria' },
  };
  const asynja: ConflictRecord = {
    factKey: 'allergy:Penicillin',
    timestamp: '2018-06-01T08:00:00Z',
    source_system: 'asynja',
    payload: { substance: 'Pc-V', severity: 'moderate' },
  };

  it('last-write-wins: senare timestamp vinner', () => {
    const out = resolver.resolve(asynja, melior);
    expect(out.winner).toBe(melior);
    expect(out.reason).toBe('timestamp');
    expect(out.merged_from).toEqual(['melior-su', 'asynja']);
  });

  it('vid samma timestamp: melior > asynja via source-priority', () => {
    const a = { ...melior, timestamp: '2025-03-15T10:00:00Z' };
    const b = { ...asynja, timestamp: '2025-03-15T10:00:00Z' };
    const out = resolver.resolve(a, b);
    expect(out.winner.source_system).toBe('melior-su');
    expect(out.reason).toBe('source_priority');
  });

  it('vid tie i source-priority: fler ifyllda fält vinner', () => {
    const a: ConflictRecord = {
      factKey: 'allergy:X',
      timestamp: '2025-03-15T10:00:00Z',
      source_system: 'unknown',
      payload: { substance: 'X' },
    };
    const b: ConflictRecord = {
      factKey: 'allergy:X',
      timestamp: '2025-03-15T10:00:00Z',
      source_system: 'also-unknown',
      payload: { substance: 'X', severity: 'moderate', reaction: 'Utslag' },
    };
    const out = resolver.resolve(a, b);
    expect(out.winner).toBe(b);
    expect(out.reason).toBe('completeness');
  });

  it('identisk: första posten vinner med reason=identical', () => {
    const a: ConflictRecord = {
      factKey: 'allergy:X',
      timestamp: '2025-03-15T10:00:00Z',
      source_system: 'melior-su',
      payload: { substance: 'X' },
    };
    const b: ConflictRecord = {
      factKey: 'allergy:X',
      timestamp: '2025-03-15T10:00:00Z',
      source_system: 'melior-su',
      payload: { substance: 'X' },
    };
    const out = resolver.resolve(a, b);
    expect(out.reason).toBe('identical');
    expect(out.merged_from).toEqual(['melior-su']);
  });
});
