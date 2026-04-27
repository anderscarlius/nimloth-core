// Prompt-store: laddar templates från disk, verifierar mot signed manifest.
//
// Säkerhetsmodell (Sprint 2):
//   1. manifest.json deklarerar SHA256 + approver per template.
//   2. Vid startup: räkna SHA256 per fil och jämför mot manifest. Mismatch
//      = service vägrar starta (REQUIRE_VALID_PROMPTS=true).
//   3. Manifest-SHA loggas i template_verifications (för dashboard/alert).
//   4. Per /propose-anrop: template-SHA bäddas in i suggestion-raden så
//      proveniensen är spårbar även om manifestet ändras senare.
//
// Sprint 5-uppgradering (planerad): manifest.json.sig med GPG-signatur,
// REQUIRE_SIGNED_PROMPTS=true tvingar verifiering mot publik nyckel.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export interface PromptManifestEntry {
  name: string;
  file: string;
  sha256: string;
  task: string;
  sensitivity: 'public' | 'schema-only' | 'pii' | 'phi';
}

export interface PromptManifest {
  version: string;
  approver: string;
  approvedAt: string;
  templates: PromptManifestEntry[];
}

export interface VerifiedTemplate {
  entry: PromptManifestEntry;
  systemPrompt: string;
  userTemplate: string;
}

export interface VerificationResult {
  manifestSha: string;
  passed: number;
  failed: number;
  failureDetails: string[];
  templates: Map<string, VerifiedTemplate>;
}

/**
 * Läs manifest + alla templates, verifiera SHA256 per fil. Returnera ladad
 * struktur. Kastar inte vid mismatch — det är upp till caller att besluta
 * (REQUIRE_VALID_PROMPTS).
 */
export function loadAndVerifyPrompts(promptsDir: string): VerificationResult {
  const manifestPath = path.join(promptsDir, 'manifest.json');
  const manifestRaw = readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestRaw) as PromptManifest;
  const manifestSha = sha256(manifestRaw);

  const templates = new Map<string, VerifiedTemplate>();
  const failureDetails: string[] = [];
  let passed = 0;
  let failed = 0;

  // 1. Verifiera varje template som finns i manifestet
  const manifestFiles = new Set<string>();
  for (const entry of manifest.templates) {
    manifestFiles.add(entry.file);
    const filePath = path.join(promptsDir, entry.file);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      failureDetails.push(`missing file: ${entry.file}`);
      failed++;
      continue;
    }
    const computed = sha256(content);
    if (computed !== entry.sha256) {
      failureDetails.push(
        `sha mismatch for ${entry.file}: expected ${entry.sha256}, got ${computed}`,
      );
      failed++;
      continue;
    }
    const { systemPrompt, userTemplate } = splitFrontmatterAndBody(content);
    templates.set(entry.name, { entry, systemPrompt, userTemplate });
    passed++;
  }

  // 2. Detektera "rogue templates" — *.md i mappen som INTE finns i manifestet
  for (const f of readdirSync(promptsDir)) {
    if (!f.endsWith('.md')) continue;
    if (!manifestFiles.has(f)) {
      failureDetails.push(`unknown template file (not in manifest): ${f}`);
      failed++;
    }
    // För säkerhets skull: validera att filen är en regular file
    const stat = statSync(path.join(promptsDir, f));
    if (!stat.isFile()) {
      failureDetails.push(`unexpected non-file at ${f}`);
      failed++;
    }
  }

  return { manifestSha, passed, failed, failureDetails, templates };
}

/**
 * Templates har strukturen:
 *   ---
 *   <YAML-frontmatter>
 *   ---
 *
 *   # System
 *   <system-prompt>
 *
 *   # User
 *   <user-template med {{PLACEHOLDER}}>
 *
 * Vi splittar på "# System" / "# User"-rubrikerna. Strikt format för att inte
 * behöva en full markdown-parser här.
 */
export function splitFrontmatterAndBody(content: string): {
  systemPrompt: string;
  userTemplate: string;
} {
  // Hoppa över YAML-frontmatter
  let body = content;
  if (body.startsWith('---\n')) {
    const end = body.indexOf('\n---\n', 4);
    if (end > 0) body = body.slice(end + 5);
  }
  const sysMatch = body.match(/(?:^|\n)#\s+System\s*\n([\s\S]*?)(?=\n#\s+User\s*\n)/);
  const usrMatch = body.match(/\n#\s+User\s*\n([\s\S]*)$/);
  if (!sysMatch || !usrMatch) {
    throw new Error('Template missing required "# System" / "# User" sections');
  }
  return {
    systemPrompt: sysMatch[1].trim(),
    userTemplate: usrMatch[1].trim(),
  };
}

/** Substituera {{PLACEHOLDER}} i user-template. Okända placeholders blir tomma. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
