// Litet, lokalt API för Smedjan-konsolen — inbyggt i Vites dev-server som
// middleware, inget separat backend-processer behövs.
//
// SÄKERHET: körs bara mot localhost (se vite.config.ts, host bunden till
// 127.0.0.1). Ingen auth — det förutsätts att bara du sitter vid din egen
// Mac. Path-traversal skyddas ändå defensivt (path.resolve + startsWith-
// kontroll) så en felaktig slug/sökväg inte råkar skriva/läsa utanför de
// fyra tillåtna rotmapparna, även om ingen elak part antas här.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, Connect } from 'vite';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED_ROOTS = ['intake', 'spec', 'backlog/stories', 'tests/contracts'] as const;

function resolveSafe(relPath: string): string | null {
  const cleaned = relPath.replace(/^\/+/, '');
  const abs = path.resolve(REPO_ROOT, cleaned);
  const okRoot = ALLOWED_ROOTS.some((root) => {
    const rootAbs = path.resolve(REPO_ROOT, root);
    return abs === rootAbs || abs.startsWith(rootAbs + path.sep);
  });
  return okRoot ? abs : null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'intag';
}

interface TreeEntry {
  path: string; // relative to repo root
  name: string;
  isDir: boolean;
  status?: string; // för backlog/stories: extraherat "**Status:**"-fält
}

function extractStatus(content: string): string | undefined {
  const m = content.match(/\*\*Status:\*\*\s*(.+)/);
  return m ? m[1].trim() : undefined;
}

function walk(relRoot: string): TreeEntry[] {
  const absRoot = path.resolve(REPO_ROOT, relRoot);
  if (!existsSync(absRoot)) return [];
  const out: TreeEntry[] = [];
  const stack = [relRoot];
  while (stack.length) {
    const rel = stack.pop()!;
    const abs = path.resolve(REPO_ROOT, rel);
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

function readJsonBody(req: Connect.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

interface DepNode {
  id: string; // t.ex. "services/fhir-facade"
  name: string; // paketnamn, t.ex. "@nimloth-core/fhir-facade"
  kind: 'service' | 'package' | 'tool';
}

interface DepEdge {
  from: string; // node id
  to: string; // node id
}

function scanWorkspaceDeps(): { nodes: DepNode[]; edges: DepEdge[] } {
  const groups: { dir: string; kind: DepNode['kind'] }[] = [
    { dir: 'services', kind: 'service' },
    { dir: 'packages', kind: 'package' },
    { dir: 'tools', kind: 'tool' },
  ];
  const nodes: DepNode[] = [];
  const nameToId = new Map<string, string>();

  for (const g of groups) {
    const groupAbs = path.resolve(REPO_ROOT, g.dir);
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
    const groupAbs = path.resolve(REPO_ROOT, g.dir);
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

export function smedjanApiPlugin(): Plugin {
  return {
    name: 'smedjan-api',
    configureServer(server) {
      server.middlewares.use('/api/deps', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(scanWorkspaceDeps()));
      });

      server.middlewares.use('/api/tree', (_req, res) => {
        const tree = {
          intake: walk('intake'),
          spec: walk('spec'),
          stories: walk('backlog/stories'),
        };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(tree));
      });

      server.middlewares.use('/api/file', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const relPath = url.searchParams.get('path') ?? '';
        const abs = resolveSafe(relPath);
        if (!abs || !existsSync(abs) || statSync(abs).isDirectory()) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'not_found_or_not_allowed' }));
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(abs, 'utf-8'));
      });

      server.middlewares.use('/api/intake', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        readJsonBody(req)
          .then((body: { title?: string; text?: string; files?: { name: string; contentBase64: string }[] }) => {
            const title = (body.title ?? '').trim();
            if (!title) throw new Error('title krävs');
            const date = new Date().toISOString().slice(0, 10);
            const slug = `${date}-${slugify(title)}`;
            const dirAbs = path.resolve(REPO_ROOT, 'intake', slug);
            const dirOk = resolveSafe(path.join('intake', slug));
            if (!dirOk) throw new Error('ogiltig sökväg');
            mkdirSync(dirAbs, { recursive: true });

            const readme = [
              `# Intag: ${title}`,
              '',
              `**Datum:** ${date}`,
              '**Inlämnat av:** (via smedjan-console)',
              `**Format på råmaterialet:** ${body.files?.length ? 'text + bifogade filer' : 'fritext'}`,
              '',
              '## Problemet eller lösningen, i råform',
              '',
              body.text?.trim() || '_(ingen text — se bifogade filer)_',
              '',
              '## Bifogade filer i denna mapp',
              '',
              ...(body.files?.length
                ? body.files.map((f) => `- ${f.name}`)
                : ['_(inga)_']),
              '',
              '---',
              '*När detta är granskat: skapa `spec/<slug>.md` och länka tillbaka hit.*',
              '',
            ].join('\n');
            writeFileSync(path.join(dirAbs, 'README.md'), readme, 'utf-8');

            for (const f of body.files ?? []) {
              const safeName = path.basename(f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
              const buf = Buffer.from(f.contentBase64, 'base64');
              writeFileSync(path.join(dirAbs, safeName), buf);
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, path: `intake/${slug}` }));
          })
          .catch((err: Error) => {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          });
      });
    },
  };
}
