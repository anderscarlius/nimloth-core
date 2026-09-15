// Delad logik mellan lokalt dev-läge (vite.smedjan-plugin.ts, Vite-middleware)
// och produktionsservern (server/index.ts). Rent filsystemsarbete — inga
// git-operationer här, se server/git.ts för det.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

export const ALLOWED_ROOTS = ['intake', 'spec', 'backlog/stories', 'tests/contracts'] as const;

export function resolveSafe(repoRoot: string, relPath: string): string | null {
  const cleaned = relPath.replace(/^\/+/, '');
  const abs = path.resolve(repoRoot, cleaned);
  const okRoot = ALLOWED_ROOTS.some((root) => {
    const rootAbs = path.resolve(repoRoot, root);
    return abs === rootAbs || abs.startsWith(rootAbs + path.sep);
  });
  return okRoot ? abs : null;
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'intag'
  );
}

export interface TreeEntry {
  path: string;
  name: string;
  isDir: boolean;
  status?: string;
}

function extractStatus(content: string): string | undefined {
  const m = content.match(/\*\*Status:\*\*\s*(.+)/);
  return m ? m[1].trim() : undefined;
}

export function walk(repoRoot: string, relRoot: string): TreeEntry[] {
  const absRoot = path.resolve(repoRoot, relRoot);
  if (!existsSync(absRoot)) return [];
  const out: TreeEntry[] = [];
  const stack = [relRoot];
  while (stack.length) {
    const rel = stack.pop()!;
    const abs = path.resolve(repoRoot, rel);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (rel !== relRoot) out.push({ path: rel, name: path.basename(rel), isDir: true });
      for (const child of readdirSync(abs)) {
        if (child.startsWith('.')) continue;
        stack.push(path.join(rel, child));
      }
    } else {
      let status: string | undefined;
      if (rel.startsWith('backlog/stories/') && rel.endsWith('.md')) {
        try {
          status = extractStatus(readFileSync(abs, 'utf-8'));
        } catch {
          /* ignore */
        }
      }
      out.push({ path: rel, name: path.basename(rel), isDir: false, status });
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export interface DepNode {
  id: string;
  name: string;
  kind: 'service' | 'package' | 'tool';
}

export interface DepEdge {
  from: string;
  to: string;
}

export function scanWorkspaceDeps(repoRoot: string): { nodes: DepNode[]; edges: DepEdge[] } {
  const groups: { dir: string; kind: DepNode['kind'] }[] = [
    { dir: 'services', kind: 'service' },
    { dir: 'packages', kind: 'package' },
    { dir: 'tools', kind: 'tool' },
  ];
  const nodes: DepNode[] = [];
  const nameToId = new Map<string, string>();

  for (const g of groups) {
    const groupAbs = path.resolve(repoRoot, g.dir);
    if (!existsSync(groupAbs)) continue;
    for (const entry of readdirSync(groupAbs)) {
      const pkgJsonPath = path.join(groupAbs, entry, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        const id = `${g.dir}/${entry}`;
        nodes.push({ id, name: pkg.name ?? id, kind: g.kind });
        if (pkg.name) nameToId.set(pkg.name, id);
      } catch {
        /* skip malformed package.json */
      }
    }
  }

  const edges: DepEdge[] = [];
  for (const g of groups) {
    const groupAbs = path.resolve(repoRoot, g.dir);
    if (!existsSync(groupAbs)) continue;
    for (const entry of readdirSync(groupAbs)) {
      const pkgJsonPath = path.join(groupAbs, entry, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        const fromId = `${g.dir}/${entry}`;
        const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
        for (const depName of Object.keys(allDeps)) {
          const toId = nameToId.get(depName);
          if (toId && toId !== fromId) edges.push({ from: fromId, to: toId });
        }
      } catch {
        /* skip */
      }
    }
  }

  return { nodes, edges };
}

export function buildIntakeReadme(input: {
  title: string;
  date: string;
  submittedBy: string;
  text?: string;
  fileNames: string[];
}): string {
  return [
    `# Intag: ${input.title}`,
    '',
    `**Datum:** ${input.date}`,
    `**Inlämnat av:** ${input.submittedBy}`,
    `**Format på råmaterialet:** ${input.fileNames.length ? 'text + bifogade filer' : 'fritext'}`,
    '',
    '## Problemet eller lösningen, i råform',
    '',
    input.text?.trim() || '_(ingen text — se bifogade filer)_',
    '',
    '## Bifogade filer i denna mapp',
    '',
    ...(input.fileNames.length ? input.fileNames.map((f) => `- ${f}`) : ['_(inga)_']),
    '',
    '---',
    '*När detta är granskat: skapa `spec/<slug>.md` och länka tillbaka hit.*',
    '',
  ].join('\n');
}
