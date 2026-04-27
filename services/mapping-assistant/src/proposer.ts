// Proposer-flödet: tar källtabell-schema + målbeskrivning, fyller
// `propose-mapping`-templaten, skickar till model-router, persisterar
// förslaget i SQLite. Skriver INTE direkt till transform/src/mappings/ —
// utkasten hamnar i `proposed/`-mappen som måste granskas och flyttas
// manuellt.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';
import type { ModelRouter } from '@nimloth-core/model-router';
import type { MappingAssistantDb, SuggestionRow } from './db.js';
import type { VerifiedTemplate } from './prompt-store.js';
import { fillTemplate } from './prompt-store.js';

export interface ProposeRequest {
  source: string;
  target: string;
  schema: Array<{ column: string; type: string; nullable?: boolean }>;
  samples?: Array<Record<string, unknown>>;
  existingMappers?: string[];
}

export class Proposer {
  constructor(
    private readonly router: ModelRouter,
    private readonly db: MappingAssistantDb,
    private readonly templates: Map<string, VerifiedTemplate>,
    private readonly proposedDir: string,
    private readonly logger: Logger,
  ) {}

  async propose(req: ProposeRequest): Promise<SuggestionRow> {
    const tpl = this.templates.get('propose-mapping');
    if (!tpl) {
      throw new Error('propose-mapping template not loaded — startup verification likely failed');
    }

    const userPrompt = fillTemplate(tpl.userTemplate, {
      SOURCE_DESCRIPTION: req.source,
      TARGET_DESCRIPTION: req.target,
      SCHEMA_JSON: JSON.stringify(req.schema, null, 2),
      SAMPLES_JSON: JSON.stringify(req.samples ?? [], null, 2),
      EXISTING_MAPPERS: (req.existingMappers ?? []).join('\n---\n') || '(inga ännu)',
    });

    const response = await this.router.invoke({
      task: 'mapping.propose',
      sensitivity: 'schema-only',
      systemPrompt: tpl.systemPrompt,
      userPrompt,
      maxTokens: 4096,
      temperature: 0,
    });

    // Extrahera kodblock — modellen kan ha lagt till prosa kring koden trots
    // instruktionen. Plocka det första ```-blocket.
    const code = extractCodeBlock(response.text);
    const reviewNotes = stripCodeBlock(response.text).trim() || null;
    const proposedPath = code ? this.writeProposed(req.target, code) : null;

    const suggestion = this.db.insertSuggestion({
      task: 'mapping.propose',
      source: req.source,
      target: req.target,
      prompt_hash: response.promptHash,
      template_name: tpl.entry.name,
      template_sha: tpl.entry.sha256,
      provider_id: response.providerId,
      model_used: response.modelUsed,
      data_residency: response.dataResidency,
      input_tokens: response.inputTokens,
      output_tokens: response.outputTokens,
      latency_ms: response.latencyMs,
      generated_text: response.text,
      review_notes: reviewNotes,
      proposed_path: proposedPath,
    });

    this.logger.info(
      {
        id: suggestion.id,
        source: req.source,
        target: req.target,
        provider: response.providerId,
        model: response.modelUsed,
        proposedPath,
      },
      'suggestion created',
    );
    return suggestion;
  }

  private writeProposed(target: string, code: string): string {
    if (!existsSync(this.proposedDir)) {
      mkdirSync(this.proposedDir, { recursive: true });
    }
    const slug = target
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${slug}-${ts}.proposed.ts`;
    const filepath = path.join(this.proposedDir, filename);
    writeFileSync(filepath, code, 'utf-8');
    return filepath;
  }
}

export function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

export function stripCodeBlock(text: string): string {
  return text.replace(/```(?:typescript|ts)?\n[\s\S]*?```/g, '');
}
