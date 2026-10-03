/** HTTP-klient mot samtycke/spärr-stub (WP-IN3). */

export async function fetchResearchConsent(
  baseUrl: string,
  personnummer: string,
): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, '')}/consent/${encodeURIComponent(personnummer)}?purpose=RESEARCH`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const json = (await res.json()) as { granted?: boolean };
    return json.granted === true;
  } catch {
    return false;
  }
}
