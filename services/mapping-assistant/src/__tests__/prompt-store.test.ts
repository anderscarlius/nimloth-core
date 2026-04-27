import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  fillTemplate,
  loadAndVerifyPrompts,
  splitFrontmatterAndBody,
} from '../prompt-store.js';

const REAL_PROMPTS = path.resolve(__dirname, '../../prompts');

function copyDir(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    copyFileSync(path.join(src, f), path.join(dst, f));
  }
}

describe('splitFrontmatterAndBody', () => {
  it('extraherar System och User-sektioner', () => {
    const content = `---
name: t
---

# System

You are a helper.

# User

Hello {{NAME}}
`;
    const r = splitFrontmatterAndBody(content);
    expect(r.systemPrompt).toBe('You are a helper.');
    expect(r.userTemplate).toBe('Hello {{NAME}}');
  });

  it('kastar om sektioner saknas', () => {
    expect(() => splitFrontmatterAndBody('# System\nfoo')).toThrow(/missing required/);
  });
});

describe('fillTemplate', () => {
  it('substituerar placeholders', () => {
    expect(fillTemplate('Hi {{NAME}}, {{GREETING}}', { NAME: 'A', GREETING: 'B' })).toBe('Hi A, B');
  });
  it('lämnar okända som tomma', () => {
    expect(fillTemplate('x={{UNKNOWN}}y', {})).toBe('x=y');
  });
});

describe('loadAndVerifyPrompts', () => {
  it('passerar verifiering på den verkliga prompts-mappen', () => {
    const r = loadAndVerifyPrompts(REAL_PROMPTS);
    expect(r.failed).toBe(0);
    expect(r.passed).toBe(3);
    expect(r.templates.has('propose-mapping')).toBe(true);
    expect(r.templates.has('explain-skip')).toBe(true);
    expect(r.templates.has('identify-pattern')).toBe(true);
  });

  it('upptäcker tampered template', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-prompts-'));
    try {
      copyDir(REAL_PROMPTS, dir);
      // Rör en av templaterna
      writeFileSync(path.join(dir, 'propose-mapping.md'), '# System\nyou are evil\n# User\n', 'utf-8');
      const r = loadAndVerifyPrompts(dir);
      expect(r.failed).toBeGreaterThan(0);
      expect(r.failureDetails.some((d) => d.includes('sha mismatch'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('upptäcker rogue template (fil utanför manifest)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mapping-prompts-'));
    try {
      copyDir(REAL_PROMPTS, dir);
      writeFileSync(path.join(dir, 'rogue.md'), 'malicious', 'utf-8');
      const r = loadAndVerifyPrompts(dir);
      expect(r.failureDetails.some((d) => d.includes('not in manifest'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
