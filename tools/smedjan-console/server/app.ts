import express, { type Express } from 'express';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { walk, resolveSafe, scanWorkspaceDeps, slugify, buildIntakeReadme } from './lib.js';
import { loadGitConfig, commitIntakeAndPush, openPullRequest, type GitConfig } from './git.js';

export interface AppOptions {
  repoRoot: string;
  staticDir?: string; // om satt: servera byggd frontend härifrån
  gitConfig?: GitConfig; // om utelämnad: läses lazy per request (låter tester injicera en fejk-config)
}

export function createApp(opts: AppOptions): Express {
  const app = express();
  app.use(express.json({ limit: '25mb' })); // täcker rimligt stora PPT/bild-uppladdningar som base64

  app.get('/api/tree', (_req, res) => {
    res.json({
      intake: walk(opts.repoRoot, 'intake'),
      spec: walk(opts.repoRoot, 'spec'),
      stories: walk(opts.repoRoot, 'backlog/stories'),
    });
  });

  app.get('/api/file', (req, res) => {
    const relPath = String(req.query.path ?? '');
    const abs = resolveSafe(opts.repoRoot, relPath);
    if (!abs || !existsSync(abs) || statSync(abs).isDirectory()) {
      res.status(404).json({ error: 'not_found_or_not_allowed' });
      return;
    }
    res.type('text/plain').send(readFileSync(abs, 'utf-8'));
  });

  app.get('/api/deps', (_req, res) => {
    res.json(scanWorkspaceDeps(opts.repoRoot));
  });

  app.post('/api/intake', async (req, res) => {
    try {
      const body = req.body as {
        title?: string;
        text?: string;
        submittedBy?: string;
        files?: { name: string; contentBase64: string }[];
      };
      const title = (body.title ?? '').trim();
      if (!title) throw new Error('title krävs');

      const date = new Date().toISOString().slice(0, 10);
      const slug = `${date}-${slugify(title)}`;
      const files = (body.files ?? []).map((f) => ({ name: f.name, buffer: Buffer.from(f.contentBase64, 'base64') }));
      const readmeContent = buildIntakeReadme({
        title,
        date,
        submittedBy: body.submittedBy?.trim() || '(okänd — smedjan-console, hostad)',
        text: body.text,
        fileNames: files.map((f) => f.name),
      });

      const cfg = opts.gitConfig ?? loadGitConfig();
      const branch = await commitIntakeAndPush(cfg, { slug, readmeContent, files });
      const prBody = [
        `Nytt intag via smedjan-console: **${title}**`,
        '',
        `Se \`intake/${slug}/README.md\` för fullständigt innehåll.`,
        '',
        '_Nästa steg: spec-granskning (se `spec/README.md`) innan nedbrytning till stories._',
      ].join('\n');
      const prUrl = await openPullRequest(cfg, branch, `Intag: ${title}`, prBody);

      res.json({ ok: true, path: `intake/${slug}`, branch, prUrl });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  if (opts.staticDir) {
    app.use(express.static(opts.staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(opts.staticDir!, 'index.html'));
    });
  }

  return app;
}
