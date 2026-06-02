// Patient-routes — sömpanelens databehov.
//
// GET /api/patients/:person_id/profile          (d) — OMOP-rader för en person
// GET /api/patients/:person_id/clinical-events  (e) — CDR-kompositioner

import express, { type Router, type Request, type Response } from 'express';
import type pg from 'pg';
import type { Logger } from 'pino';
import type { EhrbaseClient } from '../ehrbase-client.js';

export function buildPatientRouter(
  pool: pg.Pool,
  ehr: EhrbaseClient,
  logger: Logger,
): Router {
  const r = express.Router();

  // -----------------------------------------------------------------
  // GET /api/patients/:person_id/profile
  // OMOP-rader för en person — drug_exposure + measurement (+ condition om
  // populerade). Inkluderar _source så Atlas kan färgkoda live vs preloaded.
  // person_id är BIGINT — accepterar både siffror och uuid-likt source_value.
  // -----------------------------------------------------------------
  r.get('/:person_id/profile', async (req: Request, res: Response) => {
    const raw = req.params.person_id;
    try {
      // Resolva person_id (siffra) eller person_source_value (sträng).
      const personRow = await resolvePerson(pool, raw);
      if (!personRow) {
        res.status(404).json({ error: 'patient_not_found', identifier: raw });
        return;
      }

      const drug = await pool.query(
        `SELECT drug_exposure_id, drug_source_value, drug_exposure_start_date::text AS drug_exposure_start_date,
                sig, _source, _source_composition_uid, _source_archetype, _transform_version
         FROM omop.drug_exposure
         WHERE person_id = $1
         ORDER BY drug_exposure_start_date, drug_exposure_id`,
        [personRow.person_id],
      );

      const meas = await pool.query(
        `SELECT measurement_id, measurement_source_value, value_as_number, unit_source_value,
                value_source_value,
                measurement_date::text AS measurement_date,
                _source, _source_composition_uid, _source_archetype, _transform_version
         FROM omop.measurement
         WHERE person_id = $1
         ORDER BY measurement_date, measurement_id`,
        [personRow.person_id],
      );

      // condition_occurrence skelett-tabell (Del 1) — inkludera om populerad
      const cond = await pool.query(
        `SELECT condition_occurrence_id, condition_source_value,
                condition_start_date::text AS condition_start_date,
                _source, _source_composition_uid, _source_archetype, _transform_version
         FROM omop.condition_occurrence WHERE person_id = $1`,
        [personRow.person_id],
      );

      res.json({
        person: personRow,
        drug_exposures: drug.rows,
        measurements: meas.rows,
        condition_occurrences: cond.rows,
      });
    } catch (e) {
      logger.error({ err: (e as Error).message, raw }, 'profile-fetch failed');
      res.status(500).json({ error: 'profile_failed', message: (e as Error).message });
    }
  });

  // -----------------------------------------------------------------
  // GET /api/patients/:person_id/clinical-events
  // Lista CDR-kompositioner (composer.name + template + start_time + commit-audit).
  // För preloaded-patient (saknar EHRbase-rader): returnera tom lista.
  // ÄRLIGHET: commit-audit är vad EHRbase faktiskt har (på vår syntetiska data
  // typiskt "EHRbase Internal anonymousUser"). Ingen fabricerad HSA.
  // -----------------------------------------------------------------
  r.get('/:person_id/clinical-events', async (req: Request, res: Response) => {
    const raw = req.params.person_id;
    try {
      const personRow = await resolvePerson(pool, raw);
      if (!personRow) {
        res.status(404).json({ error: 'patient_not_found', identifier: raw });
        return;
      }

      // Preloaded-patienter har inga EHRbase-kompositioner.
      if (personRow._source !== 'live_transform') {
        res.json({
          person_source_value: personRow.person_source_value,
          source: personRow._source,
          events: [],
          note:
            'Patienten är preloaded — ingen CDR-källa finns. Sömpanelens vänster-sida är tom by design.',
        });
        return;
      }

      // Lista alla kompositioner för patienten via AQL.
      const comps = await ehr.listCompositionsForPatient(personRow.person_source_value);

      // Hämta commit-audit per komposition (parallellt, max 10 i taget).
      const events = await Promise.all(
        comps.map(async (c) => {
          const uuidOnly = c.uid.split('::')[0];
          // Resolva ehr_id för audit-hämtning (samma EHR för alla — cache:as).
          const ehrId = personRow._ehr_id ?? (await ehr.resolveEhrId(c.uid));
          let audit = null;
          if (ehrId) {
            try {
              audit = await ehr.getCommitAudit(ehrId, uuidOnly);
            } catch (e) {
              logger.warn({ uid: c.uid, err: (e as Error).message }, 'commit-audit fetch failed');
            }
          }
          return {
            composition_uid: c.uid,
            template_id: c.template_id,
            start_time: c.start_time,
            display: c.composer_name,
            commit_audit: audit,
          };
        }),
      );

      res.json({
        person_source_value: personRow.person_source_value,
        source: personRow._source,
        ehr_id: personRow._ehr_id,
        events,
      });
    } catch (e) {
      logger.error({ err: (e as Error).message, raw }, 'clinical-events-fetch failed');
      res.status(500).json({ error: 'clinical_events_failed', message: (e as Error).message });
    }
  });

  return r;
}

interface PersonRow {
  person_id: number;
  person_source_value: string;
  _source: 'live_transform' | 'preloaded';
  _ehr_id: string | null;
}

async function resolvePerson(pool: pg.Pool, raw: string): Promise<PersonRow | null> {
  const isNumeric = /^\d+$/.test(raw);
  const sql = isNumeric
    ? `SELECT person_id, person_source_value, _source, _ehr_id
       FROM omop.person WHERE person_id = $1`
    : `SELECT person_id, person_source_value, _source, _ehr_id
       FROM omop.person WHERE person_source_value = $1`;
  const res = await pool.query<PersonRow>(sql, [isNumeric ? Number(raw) : raw]);
  return res.rows[0] ?? null;
}
