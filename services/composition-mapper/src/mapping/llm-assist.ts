// LLM-assist-modul för composition-mapper. Kompletterar de deterministiska
// 1:1-mapparna i deterministic.ts med fyra LLM-tolknings-prompts:
//
//   1. parseDosageText      — free-text dosage → DV_QUANTITY
//   2. parseDosageTiming    — timing.code.text → frequency-kod
//   3. inferStatus          — status-inferens när FHIR-status är null/unknown
//   4. suggestAtc           — ATC-suggestion när coding[0].code saknas
//
// Routning: @nimloth-core/model-router task `mapping.medication.compose` med
// PHI-hard-rule (B18.0-leverans). Pattern: prompt → JSON-i-text → Zod-
// validering → upp till 3 attempts → null vid fail-soft.
//
// Returnerar `null` när LLM inte producerar valid output efter 3 attempts.
// Caller (4.6 aggregator) tolkar null som "kräver human-review eller
// deterministisk fallback".

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { ModelRouter } from '@nimloth-core/model-router';
import type { MedicationStatement } from '../validation/fhir.js';

// ============================================================
// Output-schemas (sources of truth — prompts hänvisar hit)
// ============================================================

export const DosageQuantitySchema = z.object({
  value: z.number().nullable(),
  unit: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type DosageQuantity = z.infer<typeof DosageQuantitySchema>;

export const FrequencySchema = z.object({
  code: z
    .enum(['DAILY', 'BID', 'TID', 'QID', 'PRN', 'WEEKLY', 'MONTHLY', 'OTHER'])
    .nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type Frequency = z.infer<typeof FrequencySchema>;

export const StatusInferenceSchema = z.object({
  status: z
    .enum(['active', 'completed', 'abandoned', 'suspended', 'planned'])
    .nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type StatusInference = z.infer<typeof StatusInferenceSchema>;

export const AtcSuggestionSchema = z.object({
  // ATC-format: 1 bokstav + 2 siffror + 2 bokstäver + 2 siffror
  code: z.string().regex(/^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/).nullable(),
  display: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type AtcSuggestion = z.infer<typeof AtcSuggestionSchema>;

// ============================================================
// LlmField<T> — output-form parallell till deterministic.ts MappedField<T>
// ============================================================

export interface LlmField<T> {
  value: T;
  confidence: number;
  reasoning?: string;
  attempts: number; // 1-3
}

// ============================================================
// Helpers
// ============================================================

/**
 * Extrahera första JSON-objektet ur text. Tolererar:
 * - Prefix-prosa ("Här är JSON-svaret: {...}")
 * - Markdown-fenced block (```json\n{...}\n```)
 * - DeepSeek-R1-style <think>...</think>-block före JSON
 *
 * Strategi: prioritera fenced block (mest robust), fall tillbaka på
 * brace-matchning (första `{` till sista `}`).
 */
export function extractJson(text: string): unknown | null {
  // 1) Markdown-fenced JSON-block — högsta prioritet
  const fencedMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch {
      // fortsätt till brace-matchning
    }
  }
  // 2) Brace-matchning — första { till sista }, accepterar nested struktur
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  try {
    return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

const TASK_ID = 'mapping.medication.compose';

/**
 * Anropa router, extrahera JSON, validera mot schema. Retry upp till
 * `maxAttempts` (default 3 = initial + 2 retries) på extract- eller
 * Zod-fel. Returnerar `null` vid uppgivande.
 */
export async function invokeAndParse<T>(
  router: ModelRouter,
  systemPrompt: string,
  userPrompt: string,
  schema: z.ZodSchema<T>,
  logger: Logger,
  maxAttempts = 3,
): Promise<{ data: T; attempts: number } | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await router.invoke({
        task: TASK_ID,
        sensitivity: 'phi',
        systemPrompt,
        userPrompt,
        maxTokens: 500,
        temperature: 0,
      });
      const json = extractJson(response.text);
      if (json === null) {
        logger.debug({ attempt, reason: 'extract_failed' }, 'llm-assist parse retry');
        continue;
      }
      const parsed = schema.safeParse(json);
      if (parsed.success) {
        return { data: parsed.data, attempts: attempt };
      }
      logger.debug(
        { attempt, reason: 'zod_failed', issues: parsed.error.issues.map((i) => i.path) },
        'llm-assist parse retry',
      );
    } catch (err) {
      logger.warn(
        { attempt, err: err instanceof Error ? err.message : String(err) },
        'llm-assist invoke error',
      );
    }
  }
  return null;
}

// ============================================================
// Prompt-loading (sync från prompts/-katalogen vid construct)
// ============================================================

interface PromptTemplate {
  id: string;
  system: string;
  userTemplate: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, 'prompts');

/**
 * Laddar alla `.md`-filer från prompts/-katalogen. Frontmatter är YAML-
 * style mellan `---`-rader; resten är prompt-body med `# System` och
 * `# User`-sektioner.
 */
export function loadPrompts(promptsDir: string = PROMPTS_DIR): Record<string, PromptTemplate> {
  const files = readdirSync(promptsDir).filter((f) => f.endsWith('.md'));
  const out: Record<string, PromptTemplate> = {};
  for (const file of files) {
    const raw = readFileSync(join(promptsDir, file), 'utf-8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      throw new Error(`prompt ${file} saknar YAML-frontmatter`);
    }
    const frontmatter = match[1] ?? '';
    const body = match[2] ?? '';
    const idMatch = frontmatter.match(/^id:\s*(\S+)/m);
    if (!idMatch?.[1]) {
      throw new Error(`prompt ${file} saknar id i frontmatter`);
    }
    const id = idMatch[1];
    // Splitta på # System / # User
    const sysIdx = body.indexOf('# System');
    const userIdx = body.indexOf('# User');
    if (sysIdx === -1 || userIdx === -1 || userIdx <= sysIdx) {
      throw new Error(`prompt ${file} saknar # System eller # User-sektion`);
    }
    const system = body.slice(sysIdx + '# System'.length, userIdx).trim();
    const userTemplate = body.slice(userIdx + '# User'.length).trim();
    out[id] = { id, system, userTemplate };
  }
  return out;
}

/** Render userTemplate med variabel-substitution. `{{KEY}}` → vars.KEY. */
export function renderUser(template: string, vars: Record<string, string>): string {
  let rendered = template;
  for (const [k, v] of Object.entries(vars)) {
    rendered = rendered.replaceAll(`{{${k}}}`, v);
  }
  return rendered;
}

// ============================================================
// LlmAssist-klass
// ============================================================

export interface LlmAssistDeps {
  router: ModelRouter;
  logger: Logger;
  /** Override prompts (för tester). Default: ladda från prompts/-katalogen. */
  prompts?: Record<string, PromptTemplate>;
}

export class LlmAssist {
  private readonly router: ModelRouter;
  private readonly logger: Logger;
  private readonly prompts: Record<string, PromptTemplate>;

  constructor(deps: LlmAssistDeps) {
    this.router = deps.router;
    this.logger = deps.logger;
    this.prompts = deps.prompts ?? loadPrompts();
  }

  // -- 1. parseDosageText ------------------------------------------------
  async parseDosageText(ms: MedicationStatement): Promise<LlmField<DosageQuantity> | null> {
    const text = ms.dosage?.[0]?.text;
    if (!text) return null;
    return this.invokePrompt(
      'parse-dosage-text',
      { TEXT: text },
      DosageQuantitySchema,
    );
  }

  // -- 2. parseDosageTiming ---------------------------------------------
  async parseDosageTiming(ms: MedicationStatement): Promise<LlmField<Frequency> | null> {
    const text =
      ms.dosage?.[0]?.timing?.code?.text ??
      ms.dosage?.[0]?.timing?.code?.coding?.[0]?.display ??
      ms.dosage?.[0]?.text ??
      null;
    if (!text) return null;
    return this.invokePrompt('parse-dosage-timing', { TEXT: text }, FrequencySchema);
  }

  // -- 3. inferStatus ----------------------------------------------------
  async inferStatus(ms: MedicationStatement): Promise<LlmField<StatusInference> | null> {
    // Bygg en kompakt sammanfattning av temporala signaler för inferens.
    // Behåll inputen till model minimal — bara fält som rimligen påverkar
    // status-inferens. Inga patientidentifierare.
    const fhirStatus = ms.status;
    const start = ms.effectiveDateTime ?? ms.effectivePeriod?.start ?? null;
    const end = ms.effectivePeriod?.end ?? null;
    const dosageText = ms.dosage?.[0]?.text ?? null;
    const summary = JSON.stringify({ fhirStatus, start, end, dosageText });
    return this.invokePrompt('infer-status', { SUMMARY: summary }, StatusInferenceSchema);
  }

  // -- 4. suggestAtc -----------------------------------------------------
  async suggestAtc(ms: MedicationStatement): Promise<LlmField<AtcSuggestion> | null> {
    // Bygg input från display/text om coding[0].code saknas eller är
    // generisk (UNKNOWN, lokal-formulärs-id etc).
    const display = ms.medicationCodeableConcept.coding[0]?.display ?? null;
    const text = ms.medicationCodeableConcept.text ?? null;
    const dosageHint = ms.dosage?.[0]?.text ?? null;
    if (!display && !text) return null;
    const input = JSON.stringify({ display, text, dosageHint });
    return this.invokePrompt('suggest-atc', { INPUT: input }, AtcSuggestionSchema);
  }

  // ----------------------------------------------------------------------
  // Internt: rendera prompt + invoke + map till LlmField<T>
  // ----------------------------------------------------------------------
  private async invokePrompt<T extends { confidence: number; reasoning: string }>(
    promptId: string,
    vars: Record<string, string>,
    schema: z.ZodSchema<T>,
  ): Promise<LlmField<T> | null> {
    const tpl = this.prompts[promptId];
    if (!tpl) {
      this.logger.error({ promptId }, 'llm-assist prompt missing');
      return null;
    }
    const userPrompt = renderUser(tpl.userTemplate, vars);
    const result = await invokeAndParse(
      this.router,
      tpl.system,
      userPrompt,
      schema,
      this.logger,
    );
    if (result === null) return null;
    return {
      value: result.data,
      confidence: result.data.confidence,
      reasoning: result.data.reasoning,
      attempts: result.attempts,
    };
  }
}
