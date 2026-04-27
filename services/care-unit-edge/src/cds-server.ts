// Minimal CDS Hooks-server för care-unit-edge.
// Tre regler — samma kontrakt som central CDS Hooks men reducerade
// (kollar bara mot lokal SQLite-cache).
//
// Detta är *inte* en kopia av central cds-hooks-tjänsten — vi vill behålla
// edge:n liten. Reglerna är inlinade här och kör mot lokal data via db:n.

import express from 'express';
import type { Logger } from 'pino';
import type { CareUnitDb } from './db.js';

interface CdsCard {
  uuid?: string;
  summary: string;
  indicator: 'info' | 'warning' | 'critical';
  source: { label: string };
  detail?: string;
}

const ANTICOAG_ATC = ['B01AA03']; // Waran

export function createCdsServer(deps: { db: CareUnitDb; logger: Logger; unitId: string }): express.Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/cds-services', (_req, res) => {
    res.json({
      services: [
        {
          id: 'core-anticoagulation',
          hook: 'patient-view',
          title: 'Nimloth Core (care-unit-edge) — Antikoagulation',
          description: 'Triggar varning om patienten står på Waran',
        },
      ],
    });
  });

  app.post('/cds-services/core-anticoagulation', (req, res) => {
    const ctx = (req.body?.context ?? {}) as { patientId?: string };
    const pnr = (ctx.patientId ?? '').replace(/^Patient\//, '');
    const cards: CdsCard[] = [];
    if (pnr) {
      const meds = deps.db.db
        .prepare(`SELECT event_data FROM fhir_medications WHERE patient_pnr = ?`)
        .all(pnr) as { event_data: string }[];
      for (const row of meds) {
        try {
          const m = JSON.parse(row.event_data) as { atc_code?: string; medicationCodeableConcept?: { coding?: Array<{ code?: string }> } };
          const atc =
            m.atc_code ??
            m.medicationCodeableConcept?.coding?.[0]?.code ??
            '';
          if (ANTICOAG_ATC.some((a) => atc.startsWith(a))) {
            cards.push({
              indicator: 'critical',
              summary: 'Antikoagulerad patient — kontrollera INR före ingrepp',
              source: { label: `Care-unit-edge ${deps.unitId} · Antikoagulation` },
            });
            break;
          }
        } catch {
          /* ignore corrupt JSON row */
        }
      }
    }
    res.json({ cards });
  });

  return app;
}
