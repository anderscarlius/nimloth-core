// Delade hjälpfunktioner.

export function normalizePersonnummer(pnr: string): string {
  return pnr.replace(/[^0-9]/g, '').padStart(12, '19');
}

export function getInstanceIdFromEnv(fallback = 'su'): string {
  return process.env.MELIOR_INSTANCE_ID ?? process.env.EDGE_INSTANCE_ID ?? fallback;
}
