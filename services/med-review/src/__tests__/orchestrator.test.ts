import { describe, expect, it } from "vitest";
import { runReview, type StreamEvent } from "../orchestrator.js";
import type { AqlClient, ExecuteResult } from "../aql-client.js";
import { deterministicNarrative, type SynthInput } from "../synthesis.js";

// Deterministisk syntes-stub — håller orkestrator-unit-testet snabbt + isolerat
// (inga riktiga Claude-anrop oavsett om ANTHROPIC_API_KEY är satt).
const stubSynth = (input: SynthInput) =>
  Promise.resolve({ text: deterministicNarrative(input), source: "deterministic" as const });

// Mockad AqlClient — deterministisk, ingen EHRbase. Speglar Ingrid-formen
// (penicillinallergi + aktiv amoxicillin + warfarin) så pipelinen kan
// verifieras isolerat.
function fakeClient(): AqlClient {
  const rowsByTemplate: Record<string, unknown[]> = {
    "se.nimloth.aql.active_medications": [
      { name: "Warfarin", atc: "B01AA03" },
      { name: "Amoxicillin", atc: "J01CA04" },
      { name: "Omeprazol", atc: "A02BC01" },
    ],
    "se.nimloth.aql.active_diagnoses": [{ name: "Förmaksflimmer", icd: "I48" }],
    "se.nimloth.aql.observation_trend_by_period": [
      { timestamp: "2025-01-01T08:00:00Z", analyte: "HBA1C", magnitude: 52, unit: "mmol/mol" },
    ],
    "se.nimloth.aql.documented_allergies": [
      { substanceName: "Penicillin", substanceCode: "J01CE", criticality: "high", reactionType: "allergy" },
    ],
  };
  return {
    async execute<Row>(templateId: string): Promise<ExecuteResult<Row>> {
      const rows = (rowsByTemplate[templateId] ?? []) as Row[];
      return {
        template_id: templateId,
        template_version: "1.0.0",
        executed_at: new Date().toISOString(),
        row_count: rows.length,
        rows,
        meta: { ehrbase_ms: 1, total_ms: 1 },
      };
    },
  } as unknown as AqlClient;
}

async function collect(patientId: string, age?: number): Promise<StreamEvent[]> {
  const ev: StreamEvent[] = [];
  await runReview(patientId, age, fakeClient(), (e) => ev.push(e), stubSynth);
  return ev;
}

describe("orchestrator — stegad pipeline + audit + fynd", () => {
  it("hämtar i STEGAD ordning: medications → diagnoses → trend → allergies", async () => {
    const ev = await collect("p", 74);
    const starts = ev
      .filter((e): e is Extract<StreamEvent, { type: "step" }> => e.type === "step" && e.status === "start")
      .map((e) => e.step);
    expect(starts.slice(0, 4)).toEqual(["medications", "diagnoses", "trend", "allergies"]);
  });

  it("emitterar ett audit-event per dataaccess (S4)", async () => {
    const ev = await collect("p", 74);
    const audits = ev.filter((e) => e.type === "audit");
    expect(audits).toHaveLength(4);
    expect(audits.every((a) => a.type === "audit" && a.patientId === "p")).toBe(true);
  });

  it("kontraindikation penicillin+amoxicillin emitteras som high finding", async () => {
    const ev = await collect("p", 74);
    const findings = ev.filter((e): e is Extract<StreamEvent, { type: "finding" }> => e.type === "finding");
    const contra = findings.find((f) => f.finding.kind === "contraindication");
    expect(contra).toBeDefined();
    expect(contra?.finding.severity).toBe("high");
  });

  it("avslutar med done + narrative (LLM-seam)", async () => {
    const ev = await collect("p", 74);
    expect(ev.some((e) => e.type === "narrative")).toBe(true);
    const done = ev.find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done?.type === "done" && done.findingCount).toBeGreaterThanOrEqual(1);
  });

  it("narrative är deskriptivt + bär ej-medicinteknisk-märkning", async () => {
    const ev = await collect("p", 74);
    const narr = ev.find((e): e is Extract<StreamEvent, { type: "narrative" }> => e.type === "narrative");
    expect(narr?.text).toContain("ej medicinteknisk produkt");
  });
});
