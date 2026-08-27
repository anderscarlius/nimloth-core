// B4 Etapp 3 (B4a) — exportpaketet (Spec B4 §4, insikt 2 i prompten).
//
// Vad som exporteras är INTE "Nimloth-periodens data" i stort — S2:s
// skuggning höll legacy aktuell för allt legacy KAN bära, så den delen
// behöver ingen återföring. Exportpaketet bär det legacy INTE kan bära:
// full arketypstruktur (kanonisk openEHR-composition, inte en
// AQL-projicerad sträng), strukturerad tidszon, plus de poster som
// aldrig hann skuggas (skulden). Förlustliggaren är paketets
// innehållsförteckning — varje manifestrad pekar mot vilka av dess
// rader som förklarar varför innehållet inte finns i legacy.
//
// Gränsbeslut (Grind 1, punkt d): all generering — inklusive FHIR-
// formningen — ligger här i migration-gateway, inte i fhir-facade.
// Gatewayen äger redan all data (reverse_shadow_write_log, EHRbase- och
// legacy-klienterna); fhir-facades FHIR-maskineri är byggt för LIVE-
// frågor mot en FhirStore, ett annat problem än att en gång skriva en
// statisk exportfil. Samma modulgränsprincip som anteckning-diff.ts.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import type { LegacyClient } from "./legacy-client.js";
import type { OpenEhrClient } from "./openehr-client.js";
import { getDirection, type RoutingDirection } from "./routing.js";

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export interface SignatureProvenance {
  signedAt: string;
  legacyAuthorSign: string;
  authoritativeStoreAtSignTime: RoutingDirection;
  note: string;
}

// Insikt 3 i prompten: en legacy-signatur på en reverse-skuggad rad är
// bara ärlig om dess proveniens säger VILKEN store som var auktoritativ
// när signeringen skedde — annars ser den ut som en legacy-signatur på
// legacy:s egna villkor. Beräknas vid exporttillfället (inte lagrad
// löpande): legacy-sim kan inte pusha händelser (S2-taket), så
// gatewayen har aldrig något annat tillfälle den BEHÖVER veta svaret än
// just när paketet byggs. Återanvänder routing_history rakt av — ingen
// ny tabell.
export async function computeSignatureProvenance(
  pool: pg.Pool,
  legacyClient: LegacyClient,
  domain: string,
  careUnit: string,
  legacyNoteId: string,
): Promise<SignatureProvenance | null> {
  const legacyNote = await legacyClient.getNoteById(legacyNoteId);
  if (!legacyNote || !legacyNote.signed_at) return null;

  // legacy:s signed_at är zonlös (D6, samma antagande som shadow-write.ts
  // gör för created_at): tolkas som Europe/Stockholm.
  const signedAtDate = new Date(`${legacyNote.signed_at.replace(" ", "T")}+02:00`);
  const authoritativeStoreAtSignTime = await getDirection(pool, domain, careUnit, signedAtDate);

  return {
    signedAt: legacyNote.signed_at,
    legacyAuthorSign: legacyNote.author_sign,
    authoritativeStoreAtSignTime,
    note:
      `Signaturen gjordes under ${authoritativeStoreAtSignTime}-auktoritet ` +
      `(routing_history vid signeringstillfället). legacy:s author_sign ` +
      `("${legacyNote.author_sign}") är INTE en riktig identitet om den ` +
      `visar sentinelen — se förlustliggaren, raden "author / composer".`,
  };
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildFhirComposition(item: {
  voId: string;
  patientNo: string;
  noteText: string;
  noteCreatedAt: string;
  composerName: string;
  signature: SignatureProvenance | null;
}): Record<string, unknown> {
  return {
    resourceType: "Composition",
    id: item.voId,
    status: item.signature ? "final" : "preliminary",
    type: {
      coding: [{ system: "http://loinc.org", code: "11506-3", display: "Progress note" }],
    },
    subject: { reference: `Patient/${item.patientNo}` },
    date: item.noteCreatedAt,
    author: [{ display: item.composerName }],
    title: "Progress note (Nimloth, B4 S2-period)",
    section: [
      {
        title: "Progress note",
        text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeXml(item.noteText)}</div>` },
      },
    ],
  };
}

function buildFhirDocumentReference(item: { voId: string; patientNo: string; noteText: string; noteCreatedAt: string }): Record<string, unknown> {
  return {
    resourceType: "DocumentReference",
    id: `docref-${item.voId}`,
    status: "current",
    subject: { reference: `Patient/${item.patientNo}` },
    date: item.noteCreatedAt,
    content: [
      {
        attachment: {
          contentType: "text/plain; charset=utf-8",
          data: Buffer.from(item.noteText, "utf8").toString("base64"),
        },
      },
    ],
    context: { related: [{ reference: `Composition/${item.voId}` }] },
  };
}

interface ReverseLogRow {
  composition_uid: string;
  vo_id: string;
  patient_no: string;
  care_unit: string;
  note_text: string;
  note_created_at: string;
  legacy_note_id: string | null;
  status: "SUCCESS" | "FAILED";
}

export interface ExportManifestItem {
  voId: string;
  compositionUid: string;
  legacyNoteId: string | null;
  status: "SUCCESS" | "FAILED";
  createdAt: string;
  signature: SignatureProvenance | null;
  lossLedgerRefs: string[];
  files: { openehrComposition: string; fhirComposition: string; fhirDocumentReference: string };
  sha256: { openehrComposition: string; fhirComposition: string; fhirDocumentReference: string };
}

export interface ExportManifest {
  generatedAt: string;
  ehrId: string;
  patientNo: string;
  domain: string;
  careUnit: string;
  itemCount: number;
  timeRange: { from: string | null; to: string | null };
  // Kopierad IN i paketet (inte bara refererad) — annars är paketet inte
  // självbärande, bara ett index in i nimloth-docs. sourcePath är till
  // för spårbarhet, inte för läsning vid verifiering.
  lossLedger: { file: string; sourcePath: string; sha256: string };
  items: ExportManifestItem[];
}

// S9 punkt 3 (fullständighetsgrind): antal note_provenance-rader med
// canonical_store='openehr' MÅSTE vara lika med manifestets postantal.
// Självbärandetestet bevisar bara att paketets INNEHÅLL inte är
// korrupt — inte att paketet BÄR ALLT som borde vara med. Detta är den
// andra, oberoende kontrollen.
export async function assertManifestComplete(pool: pg.Pool, manifest: ExportManifest): Promise<void> {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM note_provenance WHERE canonical_store = 'openehr'`);
  const provenanceCount = result.rows[0].count as number;
  if (provenanceCount !== manifest.itemCount) {
    throw new Error(
      `Fullständighetsgrind fälld: note_provenance har ${provenanceCount} 'openehr'-poster men manifestet har ${manifest.itemCount}. ` +
        `"Din data är här" är inte sant förrän dessa två tal är lika.`,
    );
  }
}

export async function generateExportPackage(
  deps: {
    pool: pg.Pool;
    legacyClient: LegacyClient;
    openEhrClient: OpenEhrClient;
    domain: string;
    lossLedgerPath: string;
    lossLedgerContent: string;
    nowIso: string;
  },
  ehrId: string,
  outDir: string,
): Promise<ExportManifest> {
  const logRows = (
    await deps.pool.query<ReverseLogRow>(
      `SELECT composition_uid, vo_id, patient_no, care_unit, note_text, note_created_at, legacy_note_id, status
       FROM reverse_shadow_write_log WHERE ehr_id = $1 ORDER BY note_created_at ASC`,
      [ehrId],
    )
  ).rows;

  await mkdir(path.join(outDir, "openehr"), { recursive: true });
  await mkdir(path.join(outDir, "fhir"), { recursive: true });

  const items: ExportManifestItem[] = [];
  for (const row of logRows) {
    const rawComposition = await deps.openEhrClient.fetchRawComposition(ehrId, row.composition_uid);
    const composerName =
      (rawComposition as { composer?: { name?: string } })?.composer?.name ?? "okänd (se rå composition)";

    const signature = row.legacy_note_id
      ? await computeSignatureProvenance(deps.pool, deps.legacyClient, deps.domain, row.care_unit, row.legacy_note_id)
      : null;

    const noteCreatedAtIso = new Date(row.note_created_at).toISOString();
    const fhirComposition = buildFhirComposition({
      voId: row.vo_id,
      patientNo: row.patient_no,
      noteText: row.note_text,
      noteCreatedAt: noteCreatedAtIso,
      composerName,
      signature,
    });
    const fhirDocRef = buildFhirDocumentReference({
      voId: row.vo_id,
      patientNo: row.patient_no,
      noteText: row.note_text,
      noteCreatedAt: noteCreatedAtIso,
    });

    const openEhrJson = JSON.stringify(rawComposition, null, 2);
    const fhirCompositionJson = JSON.stringify(fhirComposition, null, 2);
    const fhirDocRefJson = JSON.stringify(fhirDocRef, null, 2);

    const files = {
      openehrComposition: `openehr/${row.vo_id}.json`,
      fhirComposition: `fhir/${row.vo_id}.composition.json`,
      fhirDocumentReference: `fhir/${row.vo_id}.documentreference.json`,
    };
    await writeFile(path.join(outDir, files.openehrComposition), openEhrJson, "utf8");
    await writeFile(path.join(outDir, files.fhirComposition), fhirCompositionJson, "utf8");
    await writeFile(path.join(outDir, files.fhirDocumentReference), fhirDocRefJson, "utf8");

    items.push({
      voId: row.vo_id,
      compositionUid: row.composition_uid,
      legacyNoteId: row.legacy_note_id,
      status: row.status,
      createdAt: noteCreatedAtIso,
      signature,
      lossLedgerRefs: row.status === "FAILED" ? ["author / composer (nimloth_to_legacy)", "created_at (tidszon, nimloth_to_legacy)"] : ["author / composer (nimloth_to_legacy)"],
      files,
      sha256: {
        openehrComposition: sha256Hex(openEhrJson),
        fhirComposition: sha256Hex(fhirCompositionJson),
        fhirDocumentReference: sha256Hex(fhirDocRefJson),
      },
    });
  }

  const lossLedgerFile = "forlustliggare.md";
  await writeFile(path.join(outDir, lossLedgerFile), deps.lossLedgerContent, "utf8");

  const dates = items.map((i) => i.createdAt).sort();
  const manifest: ExportManifest = {
    generatedAt: deps.nowIso,
    ehrId,
    patientNo: logRows[0]?.patient_no ?? "",
    domain: deps.domain,
    careUnit: logRows[0]?.care_unit ?? "",
    itemCount: items.length,
    timeRange: { from: dates[0] ?? null, to: dates[dates.length - 1] ?? null },
    lossLedger: { file: lossLedgerFile, sourcePath: deps.lossLedgerPath, sha256: sha256Hex(deps.lossLedgerContent) },
    items,
  };

  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await assertManifestComplete(deps.pool, manifest);

  return manifest;
}
