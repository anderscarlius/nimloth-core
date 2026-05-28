// Minimal EHRbase AQL klient — service-internt. Endast queries (POST /query/aql).
// MVP-snitt: ingen retry-policy, ingen connection pooling. EHRbase är på samma
// LAN och vi mäter inte mot extern latens i denna fas.

export interface AqlResultRaw {
  rows?: unknown[][];
  columns?: Array<{ name: string; path?: string }>;
}

export class EhrbaseError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`EHRbase HTTP ${status}`);
  }
}

export async function runAql(
  baseUrl: string,
  aql: string,
  abortMs = 15_000,
): Promise<AqlResultRaw> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), abortMs);
  try {
    const r = await fetch(`${baseUrl}/rest/openehr/v1/query/aql`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ q: aql }),
      signal: ac.signal,
    });
    if (!r.ok) {
      const body = await r.text();
      throw new EhrbaseError(r.status, body.slice(0, 2000));
    }
    return (await r.json()) as AqlResultRaw;
  } finally {
    clearTimeout(timer);
  }
}
