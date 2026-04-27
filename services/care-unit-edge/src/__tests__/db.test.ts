import { describe, expect, it, beforeEach } from 'vitest';
import path from 'node:path';
import pino from 'pino';
import { CareUnitDb } from '../db.js';

const MIGRATIONS = path.resolve(__dirname, '../../migrations');

function freshDb(): CareUnitDb {
  // ":memory:" ger en isolerad SQLite-instans per test
  const db = new CareUnitDb(':memory:');
  db.migrate(MIGRATIONS, pino({ level: 'silent' }));
  return db;
}

describe('CareUnitDb — migrations', () => {
  it('skapar alla tabeller idempotent', () => {
    const db = freshDb();
    db.migrate(MIGRATIONS, pino({ level: 'silent' })); // andra körningen ska inte krascha
    expect(db.countPatients()).toBe(0);
    expect(db.outboxStats()).toEqual({ pending: 0, synced: 0 });
  });
});

describe('CareUnitDb — patient CRUD', () => {
  let db: CareUnitDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('upsertar och hämtar patient', () => {
    db.upsertPatient({
      personnummer: '19500315-2384',
      fornamn: 'Ingrid',
      efternamn: 'Andersson',
      fodelsedatum: '1950-03-15',
      kon: 'K',
      source_systems: ['melior-su'],
      event_data: { note: 'test' },
    });
    expect(db.countPatients()).toBe(1);
    const found = db.findPatientByPnr('19500315-2384');
    expect(found?.fornamn).toBe('Ingrid');
    expect(found?.efternamn).toBe('Andersson');
  });

  it('upsertar uppdaterar version', () => {
    db.upsertPatient({
      personnummer: '19500315-2384',
      fornamn: 'Ingrid',
      efternamn: 'Andersson',
      fodelsedatum: '1950-03-15',
      kon: 'K',
      event_data: {},
    });
    db.upsertPatient({
      personnummer: '19500315-2384',
      fornamn: 'Ingrid-Marie',
      efternamn: 'Andersson',
      fodelsedatum: '1950-03-15',
      kon: 'K',
      event_data: {},
    });
    const r = db.db.prepare('SELECT version FROM fhir_patients WHERE personnummer=?').get('19500315-2384') as { version: number };
    expect(r.version).toBe(2);
  });
});

describe('CareUnitDb — outbox', () => {
  let db: CareUnitDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('enkö och idempotency via payload-hash', () => {
    const a = db.enqueueOutbox({
      event_type: 'create',
      resource_type: 'Observation',
      resource_id: 'obs-1',
      payload: { foo: 'bar' },
    });
    expect(a.enqueued).toBe(true);
    const b = db.enqueueOutbox({
      event_type: 'create',
      resource_type: 'Observation',
      resource_id: 'obs-1',
      payload: { foo: 'bar' },
    });
    expect(b.enqueued).toBe(false);
    expect(b.hash).toBe(a.hash);
    expect(db.outboxStats().pending).toBe(1);
  });

  it('markSynced och pendingOutbox FIFO-ordning', () => {
    db.enqueueOutbox({ event_type: 'a', resource_type: 'Observation', resource_id: 'o1', payload: { v: 1 } });
    db.enqueueOutbox({ event_type: 'a', resource_type: 'Observation', resource_id: 'o2', payload: { v: 2 } });
    db.enqueueOutbox({ event_type: 'a', resource_type: 'Observation', resource_id: 'o3', payload: { v: 3 } });

    const pending = db.pendingOutbox(2);
    expect(pending.length).toBe(2);
    expect(pending[0].resource_id).toBe('o1');
    expect(pending[1].resource_id).toBe('o2');

    db.markSynced([pending[0].id, pending[1].id]);
    const remaining = db.pendingOutbox(10);
    expect(remaining.length).toBe(1);
    expect(remaining[0].resource_id).toBe('o3');
    expect(db.outboxStats()).toEqual({ pending: 1, synced: 2 });
  });

  it('markAttemptFailed bumpar sync_attempts utan att radera raden', () => {
    db.enqueueOutbox({ event_type: 'a', resource_type: 'Observation', resource_id: 'o1', payload: { v: 1 } });
    const [row] = db.pendingOutbox(1);
    db.markAttemptFailed(row.id, 'timeout');
    const [again] = db.pendingOutbox(1);
    expect(again.sync_attempts).toBe(1);
    expect(again.last_error).toBe('timeout');
  });
});

describe('CareUnitDb — sync-state', () => {
  it('upsertar och läser cursor', () => {
    const db = freshDb();
    expect(db.getSyncState('pull_cursor')).toBeNull();
    db.setSyncState('pull_cursor', '2026-04-26T10:00:00Z');
    expect(db.getSyncState('pull_cursor')).toBe('2026-04-26T10:00:00Z');
    db.setSyncState('pull_cursor', '2026-04-26T11:00:00Z');
    expect(db.getSyncState('pull_cursor')).toBe('2026-04-26T11:00:00Z');
  });
});

describe('CareUnitDb — applyResource + listResourcesForPatient', () => {
  it('skriver Observation och kan läsa tillbaka via patient', () => {
    const db = freshDb();
    db.upsertPatient({
      personnummer: '19500315-2384',
      fornamn: 'Ingrid',
      efternamn: 'Andersson',
      fodelsedatum: '1950-03-15',
      kon: 'K',
      event_data: {},
    });
    db.applyResource({
      resource_type: 'Observation',
      resource_id: 'obs-1',
      patient_pnr: '19500315-2384',
      payload: { resourceType: 'Observation', code: 'BP' },
      source_system: 'melior-su',
    });
    const r = db.listResourcesForPatient('19500315-2384');
    expect(r.length).toBe(1);
    expect(r[0].resourceType).toBe('Observation');
  });
});
