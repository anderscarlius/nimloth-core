// Care-unit-edge sync-API (Sprint 1, P2).
//
// Exponerar tre endpoints utanför /fhir/r4-prefixet (alltså utanför
// PDL-middleware-kedjan — sync är systemkommunikation, inte klinisk
// access. Auth via X-Care-Unit-ID-header räcker i Sprint 1; SITHS-cert
// kommer i Sprint 3 / P5).
//
//   POST /sync/push      — care-unit skickar lokala events att aggregera
//   GET  /sync/pull      — care-unit hämtar deltas för listade patienter
//   POST /sync/heartbeat — care-unit pingar in liveness + status
//
// Inkommande push-events publiceras till Kafka-topics core.clinical.*
// med source_instance="care-unit-<id>". De materialiseras därmed
// genom samma materializer som central data och syns i FHIR Facade på
// vanlig väg.

import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Producer } from 'kafkajs';
import type pg from 'pg';
import type { Logger } from 'pino';

interface PushEvent {
  event_type: string;
  resource_type: string;
  resource_id: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  created_at: string;
}

interface PushBody {
  unit_id: string;
  unit_hsa_id?: string;
  events: PushEvent[];
}

interface HeartbeatBody {
  unit_id: string;
  unit_name?: string;
  unit_hsa_id?: string;
  mode?: string;
  patients_cached?: number;
  outbox?: { pending: number; synced: number };
  edge_type?: string;
  last_sync?: Record<string, unknown>;
}

interface PullEvent {
  resource_type: string;
  resource_id: string;
  patient_pnr: string;
  payload: Record<string, unknown>;
  source_system: string | null;
  cursor: string;
}

const RESOURCE_TO_TOPIC: Record<string, string> = {
  Observation: 'core.clinical.observation.vitals',
  MedicationStatement: 'core.clinical.medication.prescribed',
  Condition: 'core.clinical.condition.diagnosed',
  AllergyIntolerance: 'core.clinical.allergy.reported',
  Procedure: 'core.clinical.procedure.completed',
  Encounter: 'core.clinical.encounter.started',
  Patient: 'core.admin.patient.registered',
};

export interface SyncRouterDeps {
  pool: pg.Pool;
  kafkaProducer: Producer | null;
  logger: Logger;
}

export function createSyncRouter(deps: SyncRouterDeps): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));

  // -----------------------------------------------------------------
  // POST /sync/push
  // -----------------------------------------------------------------
  router.post('/push', async (req: Request, res: Response) => {
    const body = req.body as Partial<PushBody> | undefined;
    if (!body || !body.unit_id || !Array.isArray(body.events)) {
      res.status(400).json({ error: 'expected { unit_id, events: [] }' });
      return;
    }
    const unitId = body.unit_id;
    const sourceInstance = `care-unit-${unitId}`;
    const accepted: string[] = [];
    const skipped: { resource_id: string; reason: string }[] = [];

    if (!deps.kafkaProducer) {
      res.status(503).json({ error: 'kafka producer not available' });
      return;
    }

    for (const ev of body.events) {
      const topic = RESOURCE_TO_TOPIC[ev.resource_type];
      if (!topic) {
        skipped.push({ resource_id: ev.resource_id, reason: `unsupported resource_type: ${ev.resource_type}` });
        continue;
      }
      const message = {
        event_id: ev.payload_hash || randomUUID(),
        event_type: ev.event_type,
        resource_type: ev.resource_type,
        resource_id: ev.resource_id,
        source_instance: sourceInstance,
        unit_id: unitId,
        unit_hsa_id: body.unit_hsa_id,
        payload: ev.payload,
        created_at: ev.created_at,
        accepted_at: new Date().toISOString(),
      };
      try {
        await deps.kafkaProducer.send({
          topic,
          messages: [
            {
              key: ev.resource_id,
              value: JSON.stringify(message),
              headers: {
                'x-care-unit': unitId,
                'x-payload-hash': ev.payload_hash,
              },
            },
          ],
        });
        accepted.push(ev.resource_id);
      } catch (err) {
        deps.logger.warn({ err, ev: ev.resource_id }, 'sync push: kafka send failed');
        skipped.push({ resource_id: ev.resource_id, reason: 'kafka send failed' });
      }
    }

    deps.logger.info({ unit_id: unitId, accepted: accepted.length, skipped: skipped.length }, 'sync/push');
    res.json({ accepted: accepted.length, skipped });
  });

  // -----------------------------------------------------------------
  // GET /sync/pull?since=<iso>&patientIds=<csv>&unitId=<id>
  // Returnerar resurser uppdaterade efter "since" för listade patienter.
  // Cursor = senaste sedda updated_at (ISO).
  // -----------------------------------------------------------------
  router.get('/pull', async (req: Request, res: Response) => {
    const since = String(req.query.since ?? '0');
    const patientIdsRaw = String(req.query.patientIds ?? '');
    const unitId = String(req.query.unitId ?? 'unknown');
    const patientIds = patientIdsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (patientIds.length === 0) {
      res.json({ events: [], cursor: since });
      return;
    }

    // Parse since: stöd både ISO + epoch ms
    const sinceIso = parseSince(since);

    try {
      const events = await collectEvents(deps.pool, patientIds, sinceIso);
      const cursor = events.length > 0 ? events[events.length - 1].cursor : sinceIso;
      deps.logger.info({ unitId, patients: patientIds.length, events: events.length, cursor }, 'sync/pull');
      res.json({ events, cursor });
    } catch (err) {
      deps.logger.error({ err }, 'sync/pull failed');
      res.status(500).json({ error: 'pull failed', detail: String(err) });
    }
  });

  // -----------------------------------------------------------------
  // POST /sync/heartbeat
  // -----------------------------------------------------------------
  router.post('/heartbeat', async (req: Request, res: Response) => {
    const body = req.body as Partial<HeartbeatBody> | undefined;
    if (!body || !body.unit_id) {
      res.status(400).json({ error: 'expected { unit_id }' });
      return;
    }
    const message = {
      timestamp: new Date().toISOString(),
      unit_id: body.unit_id,
      unit_name: body.unit_name,
      unit_hsa_id: body.unit_hsa_id,
      mode: body.mode ?? 'unknown',
      patients_cached: body.patients_cached ?? 0,
      outbox: body.outbox ?? null,
      edge_type: body.edge_type ?? 'care-unit',
      last_sync: body.last_sync ?? null,
    };
    if (!deps.kafkaProducer) {
      res.status(503).json({ error: 'kafka producer not available' });
      return;
    }
    try {
      await deps.kafkaProducer.send({
        topic: 'core.system.edge.heartbeat',
        messages: [{ key: body.unit_id, value: JSON.stringify(message) }],
      });
      res.json({ status: 'ok', received_at: message.timestamp });
    } catch (err) {
      deps.logger.warn({ err }, 'heartbeat publish failed');
      res.status(500).json({ error: 'publish failed' });
    }
  });

  return router;
}

function parseSince(since: string): string {
  if (!since || since === '0') return new Date(0).toISOString();
  // Heuristik: epoch ms = ren siffra
  if (/^\d+$/.test(since)) {
    return new Date(Number(since)).toISOString();
  }
  // Antag ISO
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return new Date(0).toISOString();
  return d.toISOString();
}

interface RowBase {
  resource_type: string;
  resource_id: string;
  patient_pnr: string;
  payload: Record<string, unknown>;
  source_system: string | null;
  updated_at: Date | string;
}

async function collectEvents(pool: pg.Pool, patientIds: string[], sinceIso: string): Promise<PullEvent[]> {
  // Vi unionar relevanta fhir_*-tabeller med en gemensam shape och
  // sorterar på updated_at. Begränsar till listade patienter.
  const sql = `
    WITH unioned AS (
      SELECT 'Patient'::text AS resource_type,
             personnummer AS resource_id,
             personnummer AS patient_pnr,
             jsonb_build_object(
               'fornamn', fornamn,
               'efternamn', efternamn,
               'fodelsedatum', fodelsedatum,
               'kon', kon,
               'source_systems', source_systems
             ) AS payload,
             NULL::text AS source_system,
             updated_at
        FROM fhir_patients
       WHERE personnummer = ANY($1::text[]) AND updated_at > $2::timestamptz

      UNION ALL
      SELECT 'Observation', observation_id::text, patient_pnr,
             event_data, source_system, created_at
        FROM fhir_observations
       WHERE patient_pnr = ANY($1::text[]) AND created_at > $2::timestamptz

      UNION ALL
      SELECT 'MedicationStatement', medication_id::text, patient_pnr,
             event_data, source_system, created_at
        FROM fhir_medication_statements
       WHERE patient_pnr = ANY($1::text[]) AND created_at > $2::timestamptz

      UNION ALL
      SELECT 'Condition', condition_id::text, patient_pnr,
             event_data, source_system, created_at
        FROM fhir_conditions
       WHERE patient_pnr = ANY($1::text[]) AND created_at > $2::timestamptz

      UNION ALL
      SELECT 'AllergyIntolerance', allergy_id::text, patient_pnr,
             event_data, source_system, created_at
        FROM fhir_allergy_intolerances
       WHERE patient_pnr = ANY($1::text[]) AND created_at > $2::timestamptz

      UNION ALL
      SELECT 'Procedure', procedure_id::text, patient_pnr,
             event_data, source_system, created_at
        FROM fhir_procedures
       WHERE patient_pnr = ANY($1::text[]) AND created_at > $2::timestamptz

      UNION ALL
      SELECT 'Encounter', encounter_ref, patient_pnr,
             event_data, source_system, updated_at
        FROM fhir_encounters
       WHERE patient_pnr = ANY($1::text[]) AND updated_at > $2::timestamptz
    )
    SELECT * FROM unioned
    ORDER BY updated_at ASC, resource_type, resource_id
    LIMIT 500
  `;
  const r = await pool.query(sql, [patientIds, sinceIso]);
  return r.rows.map((row: RowBase) => ({
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    patient_pnr: row.patient_pnr,
    payload: row.payload,
    source_system: row.source_system,
    cursor: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
  }));
}
