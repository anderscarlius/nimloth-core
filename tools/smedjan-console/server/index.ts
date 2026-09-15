import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = process.env.SMEDJAN_REPO_ROOT;
if (!repoRoot) {
  process.stderr.write('FEL: SMEDJAN_REPO_ROOT saknas i miljön — vet inte vilken klon jag ska läsa/skriva.\n');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 11125);
const staticDir = path.resolve(__dirname, '..', 'dist'); // vite build-output, se package.json "build:client"

const app = createApp({ repoRoot, staticDir });

app.listen(port, '0.0.0.0', () => {
  // 0.0.0.0 här är avsiktligt -- i produktion körs detta i en container och
  // nås utifrån via Cloudflare Tunnel + Access, inte direkt exponerat.
  // Lokalt dev-läge (pnpm dev, Vite) binder fortfarande bara 127.0.0.1.
  process.stdout.write(`smedjan-console-server lyssnar på :${port} (repo: ${repoRoot})\n`);
});
