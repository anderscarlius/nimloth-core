// SQLite-wrapper med migration-runner. better-sqlite3 är synkron — det
// passar care-unit-edge eftersom vi har låg samtidighet (4 läkare per nod)
// och vill garantera ordning på lokala writes.

import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';

export interface OutboxRow {
  id: number;
  event_type: string;
  resource_type: string;
  resource_id: string;
  payload: string;
  payload_hash: string;
  created_at: string;
  sync_attempts: number;
  last_attempt_at: string | null;
  synced_at: string | null;
  last_error: string | null;
}

export class CareUnitDb {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // WAL ger samtidiga reads + en writer. Strömlinjeformat för our case.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  /** Kör migrations i ordning (idempotent — IF NOT EXISTS). */
  migrate(migrationsPath: string, logger: Logger): void {
    const resolved = path.isAbsolute(migrationsPath)
      ? migrationsPath
      : path.resolve(process.cwd(), migrationsPath);
    const files = readdirSync(resolved)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = readFileSync(path.join(resolved, file), 'utf-8');
      this.db.exec(sql);
      logger.info({ file }, 'migration applied');
    }
  }

  // ============================================================
  // Sync-state
  // ============================================================
  getSyncState(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM sync_state WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSyncState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO sync_state (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      )
      .run(key, value);
  }

  // ============================================================
  // Outbox
  // ============================================================
  enqueueOutbox(args: {
    event_type: string;
    resource_type: string;
    resource_id: string;
    payload: object;
  }): { enqueued: boolean; hash: string } {
    const payloadJson = JSON.stringify(args.payload);
    const hash = createHash('sha256').update(payloadJson).digest('hex');
    try {
      this.db
        .prepare(
          `INSERT INTO outbox (event_type, resource_type, resource_id, payload, payload_hash)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(args.event_type, args.resource_type, args.resource_id, payloadJson, hash);
      return { enqueued: true, hash };
    } catch (err) {
      // Unique constraint på payload_hash → idempotent: redan i outbox
      if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
        return { enqueued: false, hash };
      }
      throw err;
    }
  }

  pendingOutbox(limit: number): OutboxRow[] {
    return this.db
      .prepare<unknown[], OutboxRow>(
        `SELECT * FROM outbox WHERE synced_at IS NULL ORDER BY id ASC LIMIT ?`,
      )
      .all(limit);
  }

  markSynced(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE outbox SET synced_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  markAttemptFailed(id: number, error: string): void {
    this.db
      .prepare(
        `UPDATE outbox SET sync_attempts = sync_attempts + 1,
                          last_attempt_at = CURRENT_TIMESTAMP,
                          last_error = ?
         WHERE id = ?`,
      )
      .run(error, id);
  }

  outboxStats() {
    const pending = this.db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE synced_at IS NULL').get() as { n: number };
    const synced = this.db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE synced_at IS NOT NULL').get() as { n: number };
    return { pending: pending.n, synced: synced.n };
  }

  // ============================================================
  // FHIR-projektioner — minimala upserts (kan utökas med fler resurser)
  // ============================================================
  upsertPatient(p: {
    personnummer: string;
    fornamn: string | null;
    efternamn: string | null;
    fodelsedatum: string | null;
    kon: string | null;
    source_systems?: string[];
    event_data: object;
  }): void {
    this.db
      .prepare(
        `INSERT INTO fhir_patients (personnummer, fornamn, efternamn, fodelsedatum, kon, source_systems, event_data, updated_at, version)
         VALUES (@personnummer, @fornamn, @efternamn, @fodelsedatum, @kon, @source_systems, @event_data, CURRENT_TIMESTAMP, 1)
         ON CONFLICT(personnummer) DO UPDATE SET
           fornamn = excluded.fornamn,
           efternamn = excluded.efternamn,
           fodelsedatum = excluded.fodelsedatum,
           kon = excluded.kon,
           source_systems = COALESCE(excluded.source_systems, fhir_patients.source_systems),
           event_data = excluded.event_data,
           updated_at = CURRENT_TIMESTAMP,
           version = fhir_patients.version + 1`,
      )
      .run({
        personnummer: p.personnummer,
        fornamn: p.fornamn,
        efternamn: p.efternamn,
        fodelsedatum: p.fodelsedatum,
        kon: p.kon,
        source_systems: p.source_systems ? JSON.stringify(p.source_systems) : null,
        event_data: JSON.stringify(p.event_data),
      });
  }

  findPatientByPnr(pnr: string): {
    personnummer: string;
    fornamn: string | null;
    efternamn: string | null;
    fodelsedatum: string | null;
    kon: string | null;
    event_data: string;
  } | null {
    return (
      (this.db
        .prepare(
          `SELECT personnummer, fornamn, efternamn, fodelsedatum, kon, event_data
             FROM fhir_patients WHERE personnummer = ?`,
        )
        .get(pnr) as
        | {
            personnummer: string;
            fornamn: string | null;
            efternamn: string | null;
            fodelsedatum: string | null;
            kon: string | null;
            event_data: string;
          }
        | undefined) ?? null
    );
  }

  countPatients(): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM fhir_patients').get() as { n: number };
    return r.n;
  }

  /** Generisk insert/update för FHIR-resurser sent från central (pull-flödet). */
  applyResource(args: {
    resource_type: 'Patient' | 'Observation' | 'MedicationStatement' | 'Condition' | 'AllergyIntolerance' | 'Procedure' | 'Encounter';
    resource_id: string;
    patient_pnr: string;
    payload: object;
    source_system?: string;
  }): void {
    const json = JSON.stringify(args.payload);
    const src = args.source_system ?? null;
    switch (args.resource_type) {
      case 'Patient':
        // Patienter går genom upsertPatient med strukturerad data
        return;
      case 'Observation':
        this.db
          .prepare(
            `INSERT OR REPLACE INTO fhir_observations
             (observation_id, patient_pnr, source_system, event_data)
             VALUES (?, ?, ?, ?)`,
          )
          .run(args.resource_id, args.patient_pnr, src, json);
        return;
      case 'MedicationStatement':
        this.db
          .prepare(
            `INSERT OR REPLACE INTO fhir_medications
             (medication_id, patient_pnr, source_system, event_data)
             VALUES (?, ?, ?, ?)`,
          )
          .run(args.resource_id, args.patient_pnr, src, json);
        return;
      case 'Condition':
        this.db
          .prepare(
            `INSERT OR REPLACE INTO fhir_conditions
             (condition_id, patient_pnr, source_system, event_data)
             VALUES (?, ?, ?, ?)`,
          )
          .run(args.resource_id, args.patient_pnr, src, json);
        return;
      case 'AllergyIntolerance':
        this.db
          .prepare(
            `INSERT OR REPLACE INTO fhir_allergies
             (allergy_id, patient_pnr, source_system, event_data)
             VALUES (?, ?, ?, ?)`,
          )
          .run(args.resource_id, args.patient_pnr, src, json);
        return;
      case 'Procedure':
        this.db
          .prepare(
            `INSERT OR REPLACE INTO fhir_procedures
             (procedure_id, patient_pnr, source_system, event_data)
             VALUES (?, ?, ?, ?)`,
          )
          .run(args.resource_id, args.patient_pnr, src, json);
        return;
      case 'Encounter':
        this.db
          .prepare(
            `INSERT OR REPLACE INTO fhir_encounters
             (encounter_ref, patient_pnr, source_system, event_data)
             VALUES (?, ?, ?, ?)`,
          )
          .run(args.resource_id, args.patient_pnr, src, json);
        return;
    }
  }

  listResourcesForPatient(pnr: string): {
    resourceType: string;
    resource: unknown;
  }[] {
    const out: { resourceType: string; resource: unknown }[] = [];
    const tables: Array<[string, string]> = [
      ['fhir_observations', 'Observation'],
      ['fhir_medications', 'MedicationStatement'],
      ['fhir_conditions', 'Condition'],
      ['fhir_allergies', 'AllergyIntolerance'],
      ['fhir_procedures', 'Procedure'],
      ['fhir_encounters', 'Encounter'],
    ];
    for (const [table, type] of tables) {
      const rows = this.db
        .prepare(`SELECT event_data FROM ${table} WHERE patient_pnr = ?`)
        .all(pnr) as { event_data: string }[];
      for (const r of rows) {
        try {
          out.push({ resourceType: type, resource: JSON.parse(r.event_data) });
        } catch {
          // korrupt JSON, hoppa
        }
      }
    }
    return out;
  }

  close(): void {
    this.db.close();
  }
}
