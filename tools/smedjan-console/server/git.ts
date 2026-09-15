// Git-operationer för produktionsservern. ENDA platsen i detta paket som
// skriver till git/GitHub på riktigt — den lokala dev-varianten
// (vite.smedjan-plugin.ts) rör aldrig git, bara disk.
//
// Alla git-kommandon körs med execFile (array-argument, inget skal) för
// att undvika command injection även om en slug/titel innehåller konstiga
// tecken. Token skrivs ALDRIG till .git/config på disk — den skickas per
// push via en engångs `http.extraheader`, samma mönster GitHub Actions
// själv använder.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);

export interface GitConfig {
  repoRoot: string;
  githubToken: string;
  githubRepo: string; // "owner/repo"
  baseBranch: string;
}

export function loadGitConfig(): GitConfig {
  const repoRoot = process.env.SMEDJAN_REPO_ROOT;
  const githubToken = process.env.SMEDJAN_GITHUB_TOKEN;
  const githubRepo = process.env.SMEDJAN_GITHUB_REPO ?? 'anderscarlius/nimloth-core';
  const baseBranch = process.env.SMEDJAN_BASE_BRANCH ?? 'main';
  if (!repoRoot) throw new Error('SMEDJAN_REPO_ROOT saknas i miljön');
  if (!githubToken) throw new Error('SMEDJAN_GITHUB_TOKEN saknas i miljön');
  return { repoRoot, githubToken, githubRepo, baseBranch };
}

async function git(cfg: GitConfig, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: cfg.repoRoot, maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

function authHeader(cfg: GitConfig): string {
  const basic = Buffer.from(`x-access-token:${cfg.githubToken}`).toString('base64');
  return `AUTHORIZATION: basic ${basic}`;
}

// Enkel in-process-lås — en delad klon kan inte hantera parallella
// checkout/commit/push samtidigt. Ett verktyg för en användare i taget
// behöver inget mer sofistikerat än en kö.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export async function ensureRepoFresh(cfg: GitConfig): Promise<void> {
  await git(cfg, ['fetch', 'origin', cfg.baseBranch]);
  await git(cfg, ['checkout', cfg.baseBranch]);
  await git(cfg, ['reset', '--hard', `origin/${cfg.baseBranch}`]);
  await git(cfg, ['clean', '-fd', '--', 'intake']); // städa ev. kvarglömda testfiler från förra körningen
}

export interface IntakeCommitInput {
  slug: string;
  readmeContent: string;
  files: { name: string; buffer: Buffer }[];
}

export async function commitIntakeAndPush(cfg: GitConfig, input: IntakeCommitInput): Promise<string> {
  return serialized(async () => {
    await ensureRepoFresh(cfg);
    const branch = `intake/${input.slug}`;

    // Ta bort ev. lokal branch med samma namn från en tidigare, avbruten körning.
    try {
      await git(cfg, ['branch', '-D', branch]);
    } catch {
      /* fanns inte — ok */
    }
    await git(cfg, ['checkout', '-b', branch]);

    const dirAbs = path.join(cfg.repoRoot, 'intake', input.slug);
    mkdirSync(dirAbs, { recursive: true });
    writeFileSync(path.join(dirAbs, 'README.md'), input.readmeContent, 'utf-8');
    for (const f of input.files) {
      const safeName = path.basename(f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      writeFileSync(path.join(dirAbs, safeName), f.buffer);
    }

    await git(cfg, ['add', path.join('intake', input.slug)]);
    await git(cfg, ['-c', 'user.email=smedjan-console@nimloth.local', '-c', 'user.name=Smedjan-konsol', 'commit', '-m', `intake: ${input.slug}`]);
    await git(cfg, [
      '-c',
      `http.https://github.com/.extraheader=${authHeader(cfg)}`,
      'push',
      '-u',
      'origin',
      branch,
      '--force-with-lease',
    ]);
    await git(cfg, ['checkout', cfg.baseBranch]); // lämna klonen redo för nästa förfrågan

    return branch;
  });
}

export async function openPullRequest(cfg: GitConfig, branch: string, title: string, body: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${cfg.githubRepo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'smedjan-console',
    },
    body: JSON.stringify({ title, head: branch, base: cfg.baseBranch, body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub PR-skapande misslyckades (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { html_url: string };
  return data.html_url;
}
