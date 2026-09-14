import type { TreeResponse, DepsResponse } from './types';

export async function fetchTree(): Promise<TreeResponse> {
  const res = await fetch('/api/tree');
  if (!res.ok) throw new Error(`Kunde inte hämta träd (HTTP ${res.status})`);
  return res.json();
}

export async function fetchFile(path: string): Promise<string> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Kunde inte hämta fil (HTTP ${res.status})`);
  return res.text();
}

export async function fetchDeps(): Promise<DepsResponse> {
  const res = await fetch('/api/deps');
  if (!res.ok) throw new Error(`Kunde inte hämta beroenden (HTTP ${res.status})`);
  return res.json();
}

export interface SubmitIntakeInput {
  title: string;
  text: string;
  files: File[];
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function submitIntake(input: SubmitIntakeInput): Promise<{ ok: boolean; path: string }> {
  const files = await Promise.all(
    input.files.map(async (f) => ({ name: f.name, contentBase64: await fileToBase64(f) })),
  );
  const res = await fetch('/api/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: input.title, text: input.text, files }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
