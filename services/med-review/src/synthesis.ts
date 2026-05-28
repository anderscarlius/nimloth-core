// Narrativ-syntes (Fas 3 AC5) — LLM-seam.
//
// S1-GRÄNS: LLM:en omformulerar ENDAST de redan beräknade deterministiska
// fynden till läsbar svenska. Den gör ALDRIG en klinisk bedömning, lägger
// ALDRIG till rekommendationer/åtgärder, och hittar ALDRIG på data. Den
// kliniska logiken sitter i regelmotorerna (runRules) — detta steg är ren
// presentation. Det håller LLM:en ur beslutsvägen (korall/AI-Act-gränsen).
//
// Offline/test: utan ANTHROPIC_API_KEY (eller vid API-fel) faller vi tillbaka
// till en deterministisk render — demon kör då fortfarande, auditbart.

import Anthropic from "@anthropic-ai/sdk";
import type { Finding } from "./rules/index.js";
import { validateNarrative, type ValidationResult } from "./synthesis-validator.js";

// Skillen: default claude-opus-4-7 om användaren inte namnger annat. Env-
// överstyrbar (t.ex. claude-haiku-4-5 för kostnad i demon — operatörens val).
const SYNTH_MODEL = process.env.MED_REVIEW_SYNTH_MODEL ?? "claude-opus-4-7";

const NON_MD_MARK =
  "Demonstration — ej medicinteknisk produkt, ej beslutsstöd.";

// Stabil systemprompt → cache_control-breakpoint. (Caching ger besparing först
// om prompten passerar modellens min-prefix, ~4096 tokens för Opus 4.7 — denna
// korta prompt cachar troligen inte, men breakpointen är korrekt placerad om
// instruktionsblocket växer.)
const SYSTEM_PROMPT = `Du är en presentationsmotor för en medicineringsgenomgång i ett demonstrationssystem.

DIN ENDA UPPGIFT: omformulera de FÄRDIGA fynden nedan till en kort, läsbar svensk sammanfattning för en kliniker.

ABSOLUTA REGLER:
- Lägg ALDRIG till kliniska bedömningar, rekommendationer eller åtgärdsförslag som inte ordagrant finns i fynden.
- Hitta ALDRIG på interaktioner, diagnoser, läkemedel, värden eller källor som inte finns i fynden.
- Du fattar INGA beslut. Den kliniska logiken är redan gjord av deterministiska regelmotorer; du återger den.
- Skriv neutralt och deskriptivt, aldrig imperativt ("ge X", "sätt ut Y" är förbjudet).
- Använd ALDRIG orden "överväg", "bör", "sätt ut/in", "justera dosen", "trappa ner", "byt ut", "förskriv" eller "remittera" i din egen röst. Återge endast en källas formulering om den finns ordagrant i fyndet.
- Håll dig till svenska. Var koncis (några meningar + en punktlista över fynden).
- Nämn att varje fynd har en källa, men uppfinn inga referenser.

OBS: din output valideras maskinellt mot fynden efteråt. Inför du ett påstående utan motsvarande fynd avvisas hela texten och ersätts av ett deterministiskt underlag.`;

export interface SynthInput {
  patientId: string;
  patientName?: string;
  medCount: number;
  diagCount: number;
  findings: Finding[];
}

export interface SynthResult {
  text: string;
  source: "llm" | "deterministic";
  /** S1-utvärdering av LLM-narrativet mot fynden. Sätts när en LLM-text
   *  genererades (även om den avvisades). Saknas vid ren offline-fallback. */
  validation?: ValidationResult;
  /** Om LLM-texten avvisades av validatorn: den förkastade texten (för audit). */
  rejectedText?: string;
}

/** Callback för strömmad syntes — anropas per text-delta (token-grupp) så UI:t
 *  kan rita narrativet live i stället för en 10s-paus. */
export type OnDelta = (delta: string) => void;

/** Injicerbar rå-generering (LLM-anropet). Returnerar färdig text, eller null
 *  om ingen LLM är tillgänglig (offline) eller anropet misslyckades. Tester
 *  injicerar en fabricerande stub för att verifiera valideringslagret utan nät. */
export type RawGenerate = (input: SynthInput, onDelta?: OnDelta) => Promise<string | null>;

/** Bygg user-meddelandet: ENBART de deterministiska fynden + räknetal. LLM:en
 *  ser aldrig råa labbvärden eller fattar beslut — den får färdiga fynd. */
function buildUserContent(input: SynthInput): string {
  const lines: string[] = [];
  lines.push(
    `Patient: ${input.patientName ?? input.patientId}. ${input.medCount} aktiva läkemedel, ${input.diagCount} diagnoser.`,
  );
  if (input.findings.length === 0) {
    lines.push("Inga fynd från regelmotorerna.");
  } else {
    lines.push("Fynd (färdigberäknade — omformulera, lägg inget till):");
    for (const f of input.findings) {
      lines.push(
        `- [${f.severity}] ${f.kind}: ${f.title}. Mekanism: ${f.mechanism} Konsekvens: ${f.consequence} (källor: ${f.sources.map((s) => s.label).join(", ")})`,
      );
    }
  }
  return lines.join("\n");
}

/** Rå LLM-generering mot Claude (strömmad). Returnerar null om ingen API-nyckel
 *  finns (offline) eller anropet misslyckas/ger tom text. Ingen validering här —
 *  det görs i synthesize() så att seamen är testbar. */
export const anthropicGenerate: RawGenerate = async (input, onDelta) => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    // Strömma Claude-svaret så UI:t kan rita narrativet token-för-token
    // (eliminerar paus-känslan utan att byta modell).
    const stream = client.messages.stream({
      model: SYNTH_MODEL,
      max_tokens: 1024, // medvetet kort: en sammanfattning, ej lång text
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildUserContent(input) }],
    });
    if (onDelta) stream.on("text", (delta) => onDelta(delta));
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch {
    return null; // vilket API-fel som helst → låt synthesize falla tillbaka
  }
};

/**
 * Syntetisera ett narrativ ur de deterministiska fynden.
 *
 * Pipeline: generera (LLM) → S2-märk → S1-VALIDERA mot fynden → godkänn/avvisa.
 * Vid avvisning eller offline faller vi tillbaka till den deterministiska
 * renderingen. Det är detta valideringssteg som gör S1 verifierad i stället för
 * prompt-beroende: en modell-swap eller prompt-redigering som smyger in ett
 * osourcerat kliniskt påstående fångas här och blockeras från klinikertexten.
 */
export async function synthesize(
  input: SynthInput,
  onDelta?: OnDelta,
  generate: RawGenerate = anthropicGenerate,
): Promise<SynthResult> {
  const raw = await generate(input, onDelta);

  // Ingen LLM (offline) eller tomt svar → ren deterministisk rendering.
  if (raw == null) {
    const text = deterministicNarrative(input);
    onDelta?.(text); // ge UI:t något att rita när inget strömmades
    return { text, source: "deterministic" };
  }

  // S2 — säkerställ ej-medicinteknisk-märkning även om LLM utelämnat den.
  const marked = raw.includes("ej medicinteknisk") ? raw : `${raw}\n\n${NON_MD_MARK}`;

  // S1 — validera LLM-texten mot fynden. Avvisas → deterministisk fallback,
  // synligt flaggat via validation.violations.
  const validation = validateNarrative(marked, input.findings);
  if (!validation.ok) {
    const fb = deterministicNarrative(input);
    return { text: fb, source: "deterministic", validation, rejectedText: marked };
  }

  return { text: marked, source: "llm", validation };
}

/** Deterministisk render — fallback + offline/test. Aldrig imperativ. */
export function deterministicNarrative(input: SynthInput): string {
  const { findings } = input;
  const high = findings.filter((f) => f.severity === "high");
  const lines: string[] = [];
  lines.push(
    `Genomgång för ${input.patientName ?? input.patientId}: ${input.medCount} aktiva läkemedel, ${input.diagCount} diagnoser, ${findings.length} fynd.`,
  );
  if (high.length > 0) {
    lines.push(`Högprioriterade fynd (${high.length}):`);
    for (const f of high) lines.push(`• ${f.title} — ${f.consequence}`);
  }
  const other = findings.filter((f) => f.severity !== "high");
  if (other.length > 0) {
    lines.push(`Övriga fynd (${other.length}): ${other.map((f) => f.title).join("; ")}.`);
  }
  if (findings.length === 0) {
    lines.push("Inga interaktions- eller Beers/STOPP-fynd för aktuell läkemedelslista.");
  }
  lines.push(`Underlaget är deterministiskt och källbelagt. ${NON_MD_MARK}`);
  return lines.join("\n");
}
