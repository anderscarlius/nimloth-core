// Minimal klient mot lokal HSA-stub (syntetisk katalog, dataklass 0).

export async function validateHsaId(baseUrl: string, hsaId: string): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, '')}/validate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ hsaId }),
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { valid?: boolean };
  return body.valid === true;
}
