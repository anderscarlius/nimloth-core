// B4 Etapp 3 — exportpaketets integritet (mot manifestet) och
// fullständighet (mot note_provenance), samt signaturprovenensen
// (insikt 3). Den skarpa, verkliga körningen (mot riktig EHRbase/
// legacy-sim/data) är dokumenterad i
// B4_Etapp3_Atergang_och_Export_2026-08-19.md.

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type pg from "pg";
import type { LegacyClient, LegacyNote } from "../legacy-client.js";
import { freshTestPool } from "./test-db.js";
import { fakeOpenEhrClient } from "./fakes.js";
import { seedIdentity } from "../identity.js";
import { setDirection } from "../routing.js";
import { writeNote } from "../shadow-write.js";
import { createGatewayAuditPublisher } from "../audit.js";
import pino from "pino";
import {
  assertManifestComplete,
  computeSignatureProvenance,
  generateExportPackage,
} from "../export-package.js";

const DOMAIN = "anteckning";
const CARE_UNIT = "vc-lund-norr";

function fakeAudit() {
  return createGatewayAuditPublisher({ brokers: [], clientId: "test", topic: "core.audit.access" }, pino({ level: "silent" }));
}

// En legacy-klient som stödjer signering (fakeLegacyClient i fakes.ts gör
// det inte — den behövs bara här, för signaturprovenens-testerna).
function fakeSignableLegacyClient(): LegacyClient & { sign(id: string, whenIso: string): void } {
  const notes = new Map<string, LegacyNote>();
  return {
    async createNote(input) {
      const note: LegacyNote = {
        id: randomUUID(),
        patient_no: input.patient_no,
        care_unit: input.care_unit,
        text: input.text,
        author_sign: input.author_sign,
        created_at: "2026-08-19 10:00:00",
        signed_at: null,
      };
      notes.set(note.id, note);
      return note;
    },
    async getNotesByPatient(patientNo) {
      return [...notes.values()].filter((n) => n.patient_no === patientNo);
    },
    async getNoteById(id) {
      return notes.get(id);
    },
    sign(id, whenIso) {
      const note = notes.get(id);
      if (note) note.signed_at = whenIso.replace("T", " ").slice(0, 19);
    },
  };
}

let pool: pg.Pool;
let outDir: string;

beforeEach(async () => {
  pool = await freshTestPool();
  outDir = await mkdtemp(path.join(tmpdir(), "b4-export-test-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

afterAll(async () => {
  await pool?.end();
});

describe("computeSignatureProvenance (insikt 3)", () => {
  it("osignerad legacy-rad ger null — inget att redovisa", async () => {
    const legacy = fakeSignableLegacyClient();
    const note = await legacy.createNote({ patient_no: "1001", care_unit: CARE_UNIT, text: "t", author_sign: "----" });
    const result = await computeSignatureProvenance(pool, legacy, DOMAIN, CARE_UNIT, note.id);
    expect(result).toBeNull();
  });

  it("signerad rad: proveniensen pekar på VILKEN store som var auktoritativ vid signeringstillfället, inte vid skrivtillfället", async () => {
    const legacy = fakeSignableLegacyClient();
    const audit = fakeAudit();
    const note = await legacy.createNote({ patient_no: "1001", care_unit: CARE_UNIT, text: "t", author_sign: "----" });

    // Skriven medan NIMLOTH var auktoritativt...
    await setDirection(pool, audit, { domain: DOMAIN, careUnit: CARE_UNIT, direction: "NIMLOTH", updatedBy: "test" });
    // ...men signerad EFTER att routingen redan växlat tillbaka. Ett
    // klart framtida datum (inte "nu") undviker varje tvetydighet från
    // computeSignatureProvenance:s +02:00-tolkning av legacy:s zonlösa
    // signed_at — se förlustliggarens tidszonsrad.
    await setDirection(pool, audit, { domain: DOMAIN, careUnit: CARE_UNIT, direction: "LEGACY_ONLY", updatedBy: "test" });
    legacy.sign(note.id, "2030-01-01T10:00:00.000Z");

    const result = await computeSignatureProvenance(pool, legacy, DOMAIN, CARE_UNIT, note.id);
    expect(result?.authoritativeStoreAtSignTime).toBe("LEGACY_ONLY");
    expect(result?.legacyAuthorSign).toBe("----");
    expect(result?.note).toContain("LEGACY_ONLY-auktoritet");
  });
});

describe("generateExportPackage — integritet och fullständighet", () => {
  it("varje fils SHA-256 i manifestet stämmer mot filens faktiska innehåll", async () => {
    const legacy = fakeSignableLegacyClient();
    const openEhr = fakeOpenEhrClient({ rawComposition: { _type: "COMPOSITION", composer: { name: "Bridge Builder" } } });
    const audit = fakeAudit();
    const ehrId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: CARE_UNIT });
    await setDirection(pool, audit, { domain: DOMAIN, careUnit: CARE_UNIT, direction: "NIMLOTH", updatedBy: "test" });

    await writeNote(pool, legacy, openEhr, audit, {
      domain: DOMAIN, patientNo: "1001", careUnit: CARE_UNIT, text: "Nimloth-född anteckning", authorSign: "----",
    });

    const manifest = await generateExportPackage(
      {
        pool, legacyClient: legacy, openEhrClient: openEhr, domain: DOMAIN,
        lossLedgerPath: "/dev/null", lossLedgerContent: "# test-liggare\n", nowIso: new Date().toISOString(),
      },
      ehrId, outDir,
    );

    expect(manifest.itemCount).toBe(1);
    const item = manifest.items[0];
    const openEhrFile = await readFile(path.join(outDir, item.files.openehrComposition), "utf8");
    const { createHash } = await import("node:crypto");
    expect(createHash("sha256").update(openEhrFile, "utf8").digest("hex")).toBe(item.sha256.openehrComposition);

    const fhirComp = JSON.parse(await readFile(path.join(outDir, item.files.fhirComposition), "utf8"));
    expect(fhirComp.resourceType).toBe("Composition");
    const fhirDocRef = JSON.parse(await readFile(path.join(outDir, item.files.fhirDocumentReference), "utf8"));
    expect(fhirDocRef.resourceType).toBe("DocumentReference");

    const lossLedgerCopy = await readFile(path.join(outDir, manifest.lossLedger.file), "utf8");
    expect(lossLedgerCopy).toBe("# test-liggare\n");
  });

  it("S9 fullständighetsgrind: note_provenance('openehr')-antal måste matcha manifestets postantal — FÄLLER annars", async () => {
    const legacy = fakeSignableLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const audit = fakeAudit();
    const ehrId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: CARE_UNIT });
    await setDirection(pool, audit, { domain: DOMAIN, careUnit: CARE_UNIT, direction: "NIMLOTH", updatedBy: "test" });
    await writeNote(pool, legacy, openEhr, audit, {
      domain: DOMAIN, patientNo: "1001", careUnit: CARE_UNIT, text: "en post", authorSign: "----",
    });

    // Simulerar en trasig provenens: en 'openehr'-rad utan motsvarande
    // reverse_shadow_write_log-rad (skulle bara kunna uppstå vid en bugg
    // — se writeNote, som alltid skriver båda i samma kodpath).
    await pool.query(
      `INSERT INTO note_provenance (logical_note_id, canonical_store) VALUES ($1, 'openehr')`,
      [randomUUID()],
    );

    await expect(generateExportPackage(
      {
        pool, legacyClient: legacy, openEhrClient: openEhr, domain: DOMAIN,
        lossLedgerPath: "/dev/null", lossLedgerContent: "# liggare\n", nowIso: new Date().toISOString(),
      },
      ehrId, outDir,
    )).rejects.toThrow(/Fullständighetsgrind fälld/);
  });

  it("assertManifestComplete ensam: godtar ett komplett manifest", async () => {
    const audit = fakeAudit();
    const legacy = fakeSignableLegacyClient();
    const openEhr = fakeOpenEhrClient();
    const ehrId = randomUUID();
    await seedIdentity(pool, { patientNo: "1001", ehrId, careUnit: CARE_UNIT });
    await setDirection(pool, audit, { domain: DOMAIN, careUnit: CARE_UNIT, direction: "NIMLOTH", updatedBy: "test" });
    await writeNote(pool, legacy, openEhr, audit, {
      domain: DOMAIN, patientNo: "1001", careUnit: CARE_UNIT, text: "en post", authorSign: "----",
    });

    const manifest = await generateExportPackage(
      {
        pool, legacyClient: legacy, openEhrClient: openEhr, domain: DOMAIN,
        lossLedgerPath: "/dev/null", lossLedgerContent: "# liggare\n", nowIso: new Date().toISOString(),
      },
      ehrId, outDir,
    );
    await expect(assertManifestComplete(pool, manifest)).resolves.toBeUndefined();
  });
});
