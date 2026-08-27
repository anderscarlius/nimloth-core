#!/usr/bin/env tsx
// A2-utfästelsen, mätt (Grind 1-amendemang punkt 2): hela
// växlingsproceduren i väggklocka, inte bara PUT-anropet. Detta skript
// utgör gatewayens egen del av proceduren (förkontroll, växling,
// bekräftelse); paritetsdiffen (fhir-facade, annat repo) körs som ett
// separat, tidsstämplat steg i samma rehearsal — se
// B4_Etapp2-rapportens demomanus för den fullständiga sekvensen.
//
// Körs:
//   GATEWAY_URL=http://localhost:11113 GATEWAY_PGPORT=10435 \
//     tsx src/scripts/execute-switch.ts anteckning vc-lund-norr NIMLOTH operator-demo

import pg from "pg";
import { getShadowDebt } from "../shadow-debt.js";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:11113";
const [domain, careUnit, direction, updatedBy] = process.argv.slice(2);

if (!domain || !careUnit || !direction || !updatedBy) {
  console.error("Användning: execute-switch.ts <domain> <care_unit> <NIMLOTH|SHADOW|LEGACY_ONLY> <updated_by>");
  process.exit(1);
}

function step(label: string): number {
  const t = Date.now();
  console.log(`[${new Date(t).toISOString()}] ${label}`);
  return t;
}

async function main(): Promise<void> {
  const pool = new pg.Pool({
    host: process.env.GATEWAY_PGHOST ?? "localhost",
    port: Number(process.env.GATEWAY_PGPORT ?? 10435),
    database: process.env.GATEWAY_PGDATABASE ?? "core",
    user: process.env.GATEWAY_PGUSER ?? "core",
    password: process.env.GATEWAY_PGPASSWORD ?? "core",
  });

  const procedureStart = step(`FÖRKONTROLL — skuggskuld (reverse_shadow_write_log)`);
  const debt = await getShadowDebt(pool);
  console.log(`  FAILED-poster: ${debt.failedCount} (förväntat 0 före första NIMLOTH-skrivning någonsin)`);
  if (debt.failedCount > 0) {
    console.log(`  VARNING: skuggskuld existerar redan — se rapportens skuggskuldsavsnitt innan beslut.`);
  }

  step(`BESLUT — växla ${domain}/${careUnit} till ${direction}, beställd av ${updatedBy}`);

  const switchStart = step(`VÄXLING — PUT /routing/${domain}/${careUnit}`);
  const resp = await fetch(`${GATEWAY_URL}/routing/${domain}/${careUnit}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ direction, updated_by: updatedBy }),
  });
  const switchEnd = Date.now();
  if (resp.status !== 200) {
    console.error(`  FEL: PUT gav status ${resp.status}`);
    process.exit(1);
  }
  console.log(`  PUT-anropet tog ${switchEnd - switchStart} ms`);

  const confirmStart = step(`BEKRÄFTELSE — läs tillbaka routing + smoke-test`);
  const readBack = (await fetch(`${GATEWAY_URL}/routing/${domain}/${careUnit}`).then((r) => r.json())) as {
    direction: string;
  };
  if (readBack.direction !== direction) {
    console.error(`  FEL: routing läser tillbaka som ${readBack.direction}, förväntade ${direction}`);
    process.exit(1);
  }
  console.log(`  routing bekräftad: ${readBack.direction}`);
  const confirmEnd = Date.now();

  const procedureEnd = confirmEnd;
  step(`KLART`);
  console.log(`\n=== Väggklocka ===`);
  console.log(`PUT-anropet:              ${switchEnd - switchStart} ms`);
  console.log(`Bekräftelsesteget:        ${confirmEnd - confirmStart} ms`);
  console.log(`Gatewayens del av proceduren (förkontroll->beslut->växling->bekräftelse): ${procedureEnd - procedureStart} ms`);
  console.log(`(Paritetsdiff-steget körs separat — addera dess tid manuellt för den fullständiga proceduren.)`);

  await pool.end();
}

main().catch((err) => {
  console.error("fatalt fel:", err);
  process.exit(1);
});
