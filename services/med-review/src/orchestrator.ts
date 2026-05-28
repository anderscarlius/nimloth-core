// Med-review-orkestrator (Fas 3 AC5) — single agent, LLM ur beslutsvägen (S1).
//
// STEGAD hämtning (AC1-benchmark-konsekvens): mediciner → diagnoser → trend →
// allergier, sekventiellt. Bounded concurrency = streaming-UX = audit-beats,
// EN mekanism (ingen wide fan-out som återinför latensproblemet).
//
// LLM-rollen: orkestrering (denna fasta pipeline) + syntes (narrativet). Den
// KLINISKA BEDÖMNINGEN görs 100% av de deterministiska regelmotorerna
// (runRules). Narrativ-syntesen nedan är en deterministisk stand-in så demon
// kör offline + auditbart; en LLM kan koppla in på SYNTHESIS_SEAM utan att röra
// beslutsvägen.

import { runRules, type Finding, type PatientSnapshot } from "./rules/index.js";
import { AqlClient, TEMPLATES } from "./aql-client.js";
import { synthesize, type SynthInput, type SynthResult, type OnDelta } from "./synthesis.js";

/** Injicerbar syntes — default är den riktiga (Claude + deterministisk fallback).
 *  Tester injicerar en deterministisk stub för isolering/hastighet. */
export type SynthFn = (input: SynthInput, onDelta?: OnDelta) => Promise<SynthResult>;

export type StreamEvent =
  | { type: "step"; step: string; status: "start" | "done"; label: string; ms?: number }
  | { type: "data"; panel: "medications" | "diagnoses" | "trend" | "allergies"; rows: unknown[] }
  | { type: "audit"; templateId: string; patientId: string; at: string; rowCount: number; ms: number }
  | { type: "finding"; finding: Finding }
  | { type: "narrative_delta"; text: string }
  | { type: "narrative"; text: string; source: "llm" | "deterministic" }
  // S1-validering: emitteras när LLM-narrativet AVVISADES (osourcerat påstående
  // upptäckt) och deterministisk fallback användes. Synlig säkerhetsbeat.
  | { type: "synthesis_rejected"; violations: string[] }
  | { type: "done"; findingCount: number; totalMs: number }
  | { type: "error"; message: string };

export type Emit = (e: StreamEvent) => void;

interface MedRow { name: string; atc: string }
interface DiagRow { name: string; icd: string }
interface TrendRow { timestamp: string; analyte: string; magnitude: number; unit: string }
interface AllergyRow { substanceName: string; substanceCode: string; criticality: string; reactionType: string }

export async function runReview(
  patientId: string,
  age: number | undefined,
  client: AqlClient,
  emit: Emit,
  synth: SynthFn = synthesize,
): Promise<void> {
  const t0 = Date.now();
  try {
    // --- Steg 1: mediciner ---
    const meds = await fetchStep<MedRow>(client, "medications", TEMPLATES.medications, patientId, "Hämtar aktiva läkemedel", emit);
    emit({ type: "data", panel: "medications", rows: meds });

    // --- Steg 2: diagnoser ---
    const diags = await fetchStep<DiagRow>(client, "diagnoses", TEMPLATES.diagnoses, patientId, "Hämtar diagnoser", emit);
    emit({ type: "data", panel: "diagnoses", rows: diags });

    // --- Steg 3: HbA1c-trend ---
    const trend = await fetchStep<TrendRow>(client, "trend", TEMPLATES.trend, patientId, "Hämtar HbA1c-trend", emit, { analyte: "HBA1C" });
    emit({ type: "data", panel: "trend", rows: trend });

    // --- Steg 4: allergier ---
    const allergies = await fetchStep<AllergyRow>(client, "allergies", TEMPLATES.allergies, patientId, "Hämtar dokumenterade allergier", emit);
    emit({ type: "data", panel: "allergies", rows: allergies });

    // --- Steg 5: deterministisk klinisk bedömning (S1 — ALDRIG LLM) ---
    emit({ type: "step", step: "analysis", status: "start", label: "Kör regelmotorer (interaktioner + Beers/STOPP)" });
    const snapshot: PatientSnapshot = {
      patientId,
      age,
      activeMedications: meds.map((m) => ({ atc: m.atc, name: m.name })),
      allergies: allergies.map((a) => ({
        substanceCode: a.substanceCode,
        substanceName: a.substanceName,
        reactionType: a.reactionType,
        criticality: a.criticality,
      })),
    };
    const findings = runRules(snapshot);
    for (const f of findings) emit({ type: "finding", finding: f });
    emit({ type: "step", step: "analysis", status: "done", label: `${findings.length} fynd` });

    // --- Steg 6: syntes (LLM-seam — Claude omformulerar fynden, S1: ej beslut) ---
    emit({ type: "step", step: "synthesis", status: "start", label: "Syntetiserar narrativ" });
    const synthResult = await synth(
      {
        patientId,
        medCount: meds.length,
        diagCount: diags.length,
        findings,
      },
      (delta) => emit({ type: "narrative_delta", text: delta }),
    );
    // S1-validering: om LLM-narrativet avvisades (osourcerat påstående) faller
    // vi tillbaka till deterministisk text och flaggar det synligt.
    const rejected = synthResult.validation && !synthResult.validation.ok;
    if (rejected) {
      emit({ type: "synthesis_rejected", violations: synthResult.validation!.violations });
    }
    emit({ type: "narrative", text: synthResult.text, source: synthResult.source });
    emit({
      type: "step",
      step: "synthesis",
      status: "done",
      label: rejected
        ? "Syntes avvisad (S1-skydd) → deterministisk fallback"
        : synthResult.source === "llm"
          ? "Claude-syntes (S1-validerad)"
          : "Deterministisk fallback",
    });

    emit({ type: "done", findingCount: findings.length, totalMs: Date.now() - t0 });
  } catch (err) {
    emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

async function fetchStep<Row>(
  client: AqlClient,
  panel: string,
  templateId: string,
  patientId: string,
  label: string,
  emit: Emit,
  extraParams: Record<string, string | number> = {},
): Promise<Row[]> {
  emit({ type: "step", step: panel, status: "start", label });
  const res = await client.execute<Row>(templateId, { patient_id: patientId, ...extraParams });
  // S4 — audit-spår per dataaccess (vilken mall, vilken patient, när).
  emit({
    type: "audit",
    templateId,
    patientId,
    at: res.executed_at,
    rowCount: res.row_count,
    ms: res.meta.total_ms,
  });
  emit({ type: "step", step: panel, status: "done", label, ms: res.meta.total_ms });
  return res.rows;
}

