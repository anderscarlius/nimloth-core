// DiagnosticReport byggs dynamiskt från fhir_observations där category='laboratory'.
// Grupperar per sample_collected_at/order_id i event_data.

import type pg from 'pg';
import { Router } from 'express';
import type { FhirDiagnosticReport, FhirBundle } from '@nimloth-core/shared/types';
import { findObservationsByPatient } from './observation.js';
import { notFound } from './patient.js';

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function buildDiagnosticReportsForPatient(
  rows: Array<{ observation_id: string; effective_at: Date | string | null; patient_pnr: string; event_data: unknown }>,
): FhirDiagnosticReport[] {
  // Gruppera per order_id från event_data.payload.order_id (eller per dag om ingen finns)
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const ev = row.event_data as { payload?: { order_id?: string; sample_collected_at?: string | number } } | undefined;
    const orderId = ev?.payload?.order_id ?? (ev?.payload?.sample_collected_at ? String(ev.payload.sample_collected_at).slice(0, 10) : `obs-${row.observation_id.slice(0, 8)}`);
    if (!groups.has(orderId)) groups.set(orderId, []);
    groups.get(orderId)!.push(row);
  }

  const reports: FhirDiagnosticReport[] = [];
  for (const [orderId, obs] of groups) {
    const first = obs[0];
    reports.push({
      resourceType: 'DiagnosticReport',
      id: `lab-${orderId}`,
      meta: { versionId: '1', lastUpdated: toIso(first.effective_at) ?? new Date().toISOString() },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
              code: 'LAB',
              display: 'Laboratory',
            },
          ],
        },
      ],
      code: { text: `Lab panel ${orderId}` },
      subject: { reference: `Patient/${first.patient_pnr}` },
      effectiveDateTime: toIso(first.effective_at),
      issued: toIso(first.effective_at),
      result: obs.map((o) => ({ reference: `Observation/${o.observation_id}` })),
    });
  }
  return reports;
}

export async function findDiagnosticReportsByPatient(pool: pg.Pool, pnr: string): Promise<FhirDiagnosticReport[]> {
  const obs = await findObservationsByPatient(pool, pnr, 'laboratory');
  return buildDiagnosticReportsForPatient(obs);
}

export function diagnosticReportRouter(pool: pg.Pool): Router {
  const router = Router();
  router.get('/', async (req, res, next) => {
    try {
      const patient = typeof req.query.patient === 'string' ? req.query.patient : undefined;
      if (!patient) {
        return res.status(400).type('application/fhir+json').json({
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'invalid', diagnostics: 'patient parameter required' }],
        });
      }
      const reports = await findDiagnosticReportsByPatient(pool, patient);
      const bundle: FhirBundle = {
        resourceType: 'Bundle',
        type: 'searchset',
        total: reports.length,
        entry: reports.map((r) => ({ resource: r, search: { mode: 'match' } })),
      };
      return res.type('application/fhir+json').json(bundle);
    } catch (err) {
      return next(err);
    }
  });
  router.get('/:id', async (_req, res) => notFound(res, 'DiagnosticReport', _req.params.id));
  return router;
}
