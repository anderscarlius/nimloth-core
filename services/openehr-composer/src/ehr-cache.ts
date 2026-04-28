// EHR-cache: persistent mappning patient_pnr → EHRbase ehr_id (UUID).
//
// Idempotency: två anrop med samma pnr returnerar samma ehr_id. Cacheraden
// skrivs efter EHR skapats i EHRbase. Race-condition (två samtidiga
// anrop för samma pnr) hanteras av ON CONFLICT DO NOTHING + re-read.

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Pool } from './db.js';
import type { EhrbaseClient } from './ehrbase-client.js';

export class EhrCache {
  public ehrsCreatedTotal = 0;

  constructor(
    private readonly pool: Pool,
    private readonly ehrbase: EhrbaseClient,
    private readonly logger: Logger,
  ) {}

  /** Returnerar befintlig ehr_id eller skapar ny. */
  async getOrCreate(patientPnr: string): Promise<string> {
    const cached = await this.lookup(patientPnr);
    if (cached) return cached;

    const newEhrId = randomUUID();
    await this.ehrbase.putEhr(newEhrId, {
      _type: 'EHR_STATUS',
      archetype_node_id: 'openEHR-EHR-EHR_STATUS.generic.v1',
      name: { value: 'EHR Status' },
      subject: {
        external_ref: {
          namespace: 'patient_pnr',
          id: { _type: 'GENERIC_ID', value: patientPnr, scheme: 'pnr' },
          type: 'PERSON',
        },
      },
      is_modifiable: true,
      is_queryable: true,
    });

    // Race: en annan process kan ha skapat samtidigt. ON CONFLICT → re-read.
    const insertResult = await this.pool.query<{ ehr_id: string }>(
      `INSERT INTO openehr_ehr_cache (patient_pnr, ehr_id) VALUES ($1, $2)
       ON CONFLICT (patient_pnr) DO NOTHING
       RETURNING ehr_id`,
      [patientPnr, newEhrId],
    );

    if (insertResult.rows.length > 0) {
      this.ehrsCreatedTotal += 1;
      this.logger.info({ patientPnr, ehrId: newEhrId }, 'created new EHR');
      return insertResult.rows[0].ehr_id;
    }

    // Annan process hann före — läs den ehr_id de skapade.
    // (vår nyskapade EHR i EHRbase blir orphan men stör inte funktion)
    const reread = await this.lookup(patientPnr);
    if (!reread) {
      throw new Error(`EhrCache: race-loss för pnr ${patientPnr} men post saknas vid re-read`);
    }
    this.logger.warn({ patientPnr, orphanEhrId: newEhrId, winner: reread }, 'race-loss in ehr-create');
    return reread;
  }

  async lookup(patientPnr: string): Promise<string | null> {
    const r = await this.pool.query<{ ehr_id: string }>(
      'SELECT ehr_id FROM openehr_ehr_cache WHERE patient_pnr = $1',
      [patientPnr],
    );
    return r.rows[0]?.ehr_id ?? null;
  }

  async size(): Promise<number> {
    const r = await this.pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM openehr_ehr_cache');
    return Number(r.rows[0]?.count ?? 0);
  }
}
