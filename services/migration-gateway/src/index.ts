// migration-gateway — B4, block 7 (Migreringslagret). Riktig arkitektur,
// inte rekvisita (D5). Routar skrivningar mellan nimloth-legacy-sim och
// Nimloth enligt en auditerad, hot-reloadad routingtabell.

import express, { type Request, type Response } from "express";
import pino from "pino";
import type pg from "pg";
import { createPool, migrate } from "./db.js";
import { loadConfig } from "./config.js";
import { createGatewayAuditPublisher, type GatewayAuditPublisher } from "./audit.js";
import { createLegacyClient, LegacyWriteError, type LegacyClient } from "./legacy-client.js";
import { createOpenEhrClient, type OpenEhrClient } from "./openehr-client.js";
import { writeNote } from "./shadow-write.js";
import { getDirection, listRouting, setDirection, type RoutingDirection } from "./routing.js";
import { IdentityNotFoundError, seedIdentity } from "./identity.js";
import { getNoteByIdMerged, getNotesByPatientMerged, LegacyUnavailableError } from "./read-federation.js";

const DOMAIN_NOTE = "anteckning"; // D2 — enda domänen denna etapp.

export function buildApp(
  pool: pg.Pool,
  legacyClient: LegacyClient,
  openEhrClient: OpenEhrClient,
  audit: GatewayAuditPublisher,
): express.Express {
  const app = express();
  app.use(express.json());

  // Skrivvägen — S0/S1/S2. Body-formen är legacyns egen (author_sign
  // krävs alltid — legacy behöver den direkt i S0/S1, och den fungerar
  // som fallback-komponentnamn mot EHRbase). composer_name är valfri och
  // används i stället för author_sign som EHRbase-komponentens namn när
  // den finns (t.ex. ett riktigt namn i stället för fyra bokstäver) —
  // men NÅGONSIN mot legacy: en omvänd skuggskrivning (S2) använder
  // alltid sentinelen i shadow-write.ts, aldrig något klienten skickat
  // in (Grind 1-amendemang punkt 1).
  app.post("/gateway/notes", async (req: Request, res: Response) => {
    const { patient_no, care_unit, text, author_sign, composer_name } = req.body ?? {};
    if (
      typeof patient_no !== "string" || !patient_no ||
      typeof care_unit !== "string" || !care_unit ||
      typeof text !== "string" || !text ||
      typeof author_sign !== "string" || author_sign.length !== 4 ||
      (composer_name !== undefined && typeof composer_name !== "string")
    ) {
      res.status(400).json({ fel: "ogiltig-post" });
      return;
    }
    try {
      const result = await writeNote(pool, legacyClient, openEhrClient, audit, {
        domain: DOMAIN_NOTE,
        patientNo: patient_no,
        careUnit: care_unit,
        text,
        authorSign: author_sign,
        composerName: composer_name,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof IdentityNotFoundError) {
        res.status(422).json({ fel: "identitetsmappning-saknas", meddelande: err.message });
        return;
      }
      if (err instanceof LegacyWriteError) {
        res.status(502).json({ fel: "legacy-skrivning-misslyckades", detalj: err.body });
        return;
      }
      throw err;
    }
  });

  // Läsvägen — live läsfederation, nu sammanslagen (Grind 1 fynd i, del
  // 1): legacy:s lista + Nimloth-födda poster vars omvända skuggskrivning
  // fallerat (annars osynliga i legacy, vilket bryter A5). Se
  // read-federation.ts.
  app.get("/gateway/notes/by-patient/:patient_no", async (req: Request, res: Response) => {
    const { notes, legacyUnavailable } = await getNotesByPatientMerged(pool, legacyClient, req.params.patient_no);
    res.status(200).json({ notes, legacy_unavailable: legacyUnavailable });
  });

  app.get("/gateway/notes/:id", async (req: Request, res: Response) => {
    let note;
    try {
      note = await getNoteByIdMerged(pool, legacyClient, req.params.id);
    } catch (err) {
      if (err instanceof LegacyUnavailableError) {
        res.status(503).json({ fel: "legacy-otillganglig", meddelande: err.message });
        return;
      }
      throw err;
    }
    if (!note) {
      res.status(404).json({ fel: "hittades-inte" });
      return;
    }
    const provenance = await pool.query(
      `SELECT canonical_store FROM note_provenance WHERE logical_note_id = $1`,
      [note.id],
    );
    res.status(200).json({
      ...note,
      canonical_store: provenance.rows[0]?.canonical_store ?? null,
    });
  });

  // Routingtabellen — hot-reload är gratis (ingen cache), varje ändring
  // auditeras i setDirection() själv (S5/I3). NIMLOTH tillagd (S2).
  app.put("/routing/:domain/:care_unit", async (req: Request, res: Response) => {
    const direction = req.body?.direction as RoutingDirection | undefined;
    const updatedBy = req.body?.updated_by as string | undefined;
    if (direction !== "LEGACY_ONLY" && direction !== "SHADOW" && direction !== "NIMLOTH") {
      res.status(400).json({ fel: "ogiltig-riktning", tillatna: ["LEGACY_ONLY", "SHADOW", "NIMLOTH"] });
      return;
    }
    if (!updatedBy) {
      res.status(400).json({ fel: "updated_by-kravs" });
      return;
    }
    const row = await setDirection(pool, audit, {
      domain: req.params.domain,
      careUnit: req.params.care_unit,
      direction,
      updatedBy,
    });
    res.status(200).json(row);
  });

  app.get("/routing", async (_req: Request, res: Response) => {
    res.status(200).json(await listRouting(pool));
  });

  app.get("/routing/:domain/:care_unit", async (req: Request, res: Response) => {
    const direction = await getDirection(pool, req.params.domain, req.params.care_unit);
    res.status(200).json({ domain: req.params.domain, care_unit: req.params.care_unit, direction });
  });

  // Identitetsmappningen — engångsseedning för syntetiska patienter
  // (S3). Ingen produktionsyta för att skapa riktiga mappningar dynamiskt
  // denna etapp.
  app.post("/identity", async (req: Request, res: Response) => {
    const { patient_no, ehr_id, care_unit } = req.body ?? {};
    if (!patient_no || !ehr_id || !care_unit) {
      res.status(400).json({ fel: "ogiltig-post" });
      return;
    }
    await seedIdentity(pool, { patientNo: patient_no, ehrId: ehr_id, careUnit: care_unit });
    res.status(201).json({ patient_no, ehr_id, care_unit });
  });

  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "migration-gateway" });
  });

  return app;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const pool = createPool(cfg.db);
  await migrate(pool);

  const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "migration-gateway" } });
  const audit = createGatewayAuditPublisher(
    { brokers: cfg.kafkaBrokers, clientId: "migration-gateway", topic: cfg.kafkaAuditTopic },
    logger,
  );
  const legacyClient = createLegacyClient(cfg.legacySimBaseUrl);
  const openEhrClient = createOpenEhrClient(cfg.ehrbaseBaseUrl);

  const app = buildApp(pool, legacyClient, openEhrClient, audit);
  app.listen(cfg.port, () => {
    // eslint-disable-next-line no-console
    console.log(`migration-gateway lyssnar på :${cfg.port}`);
  });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("fatalt fel vid uppstart:", err);
    process.exit(1);
  });
}
