#!/usr/bin/env tsx
// A1-mätuppställningen (Grind 1 punkt g). Skriver kontinuerligt mot
// POST /gateway/notes under ett tidsbegränsat fönster medan en separat
// process (execute-switch.ts) växlar routing mitt i. Loggar status +
// latens + tidsstämpel per anrop, både till stdout och en JSONL-fil, så
// 5xx-observationen och växlingens exakta tidsfönster kan verifieras
// oberoende av varandra efteråt.
//
// Körs:
//   GATEWAY_URL=http://localhost:11113 DURATION_MS=20000 INTERVAL_MS=200 \
//     tsx src/scripts/load-notes.ts <patient_no> <care_unit> [utfil.jsonl]

import { appendFileSync, writeFileSync } from "node:fs";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:11113";
const DURATION_MS = Number(process.env.DURATION_MS ?? 20000);
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 200);
const [patientNo, careUnit, outFileArg] = process.argv.slice(2);
const outFile = outFileArg ?? "load-run.jsonl";

if (!patientNo || !careUnit) {
  console.error("Användning: load-notes.ts <patient_no> <care_unit> [utfil.jsonl]");
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fireOne(seq: number): Promise<void> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  let status = 0;
  let errorDetail: string | null = null;
  try {
    const resp = await fetch(`${GATEWAY_URL}/gateway/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_no: patientNo,
        care_unit: careUnit,
        text: `Lasttest #${seq} — synthetic, B4 Etapp 2 A1-mätning.`,
        author_sign: "LAST",
      }),
    });
    status = resp.status;
  } catch (err) {
    errorDetail = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = Date.now() - startedAt;
  const record = { seq, startedAtIso, status, latencyMs, errorDetail };
  appendFileSync(outFile, JSON.stringify(record) + "\n");
  const marker = status >= 500 || status === 0 ? " <-- 5xx/nätverksfel" : "";
  console.log(`#${seq} ${startedAtIso} status=${status} latens=${latencyMs}ms${marker}`);
}

async function main(): Promise<void> {
  writeFileSync(outFile, "");
  console.log(`Lastgenerator: ${GATEWAY_URL}, patient=${patientNo}/${careUnit}, ${DURATION_MS}ms @ var ${INTERVAL_MS}ms\n`);
  const runUntil = Date.now() + DURATION_MS;
  let seq = 0;
  while (Date.now() < runUntil) {
    seq++;
    // Avsiktligt "fire and forget inom loopen" (inte await:ad seriellt)
    // vore mer realistisk last, men seriell + kort intervall räcker för
    // att fånga ett växlingsfönster på sekundnivå utan att komplicera
    // mätningen med samtidiga in-flight-anrop denna etapp.
    await fireOne(seq);
    await sleep(INTERVAL_MS);
  }
  console.log(`\nKlart. ${seq} anrop. Rådata: ${outFile}`);
}

main().catch((err) => {
  console.error("fatalt fel:", err);
  process.exit(1);
});
