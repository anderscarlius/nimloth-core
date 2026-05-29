// Populationsscreening-data (Fas C) — precomputerad av med-review/src/scripts/
// screen-population.ts (kör de deterministiska regelmotorerna över hela
// populationen). Serveras statiskt; demo-ytan fetchar den.

export interface ScreenFinding { severity: string; kind: string; title: string }

export interface ScreenPatient {
  patientId: string;
  profile: string;
  ehrId: string;
  medCount: number;
  diagCount: number;
  findingCount: number;
  maxSeverity: 'high' | 'moderate' | 'low' | null;
  interaction: number;
  contraindication: number;
  beers_stopp: number;
  findings: ScreenFinding[];
  failed?: boolean;
}

export interface ScreeningData {
  generatedAt: string;
  source: string;
  elapsedMs: number;
  ageNote: string;
  ruleScopeNote: string;
  totals: {
    patients: number;
    flagged: number;
    high: number;
    withInteraction: number;
    withContraindication: number;
    withBeersStopp: number;
    failed: number;
  };
  byProfile: Record<string, { total: number; flagged: number }>;
  patients: ScreenPatient[];
}

/** Patient som /med-review-genomgången körs på. Ankare har namn + ålder;
 *  syntetiska patienter har profil-id utan namn/ålder. */
export interface ReviewTarget {
  patientId: string;
  displayName: string;
  age?: number;
  subtitle?: string;
}

export async function loadScreening(): Promise<ScreeningData> {
  const res = await fetch('/screening-results.json');
  if (!res.ok) throw new Error(`Kunde inte ladda screening-data (HTTP ${res.status})`);
  return (await res.json()) as ScreeningData;
}

const PROFILE_LABELS: Record<string, string> = {
  aldre_multisjuk: 'Äldre multisjuk',
  diabetes_typ2: 'Diabetes typ 2',
  hypertoni: 'Hypertoni',
  uvi: 'UVI (recidiverande)',
  depression: 'Depression',
  brostsmarta: 'Bröstsmärta',
  hjartsvikt: 'Hjärtsvikt',
  kol: 'KOL',
  ryggsmarta: 'Ryggsmärta',
  anemi: 'Anemi',
  'ingrid-andersson': 'Ingrid Andersson',
  'lars-johansson': 'Lars Johansson',
  'anders-bergstrom': 'Anders Bergström',
  'karin-eriksson': 'Karin Eriksson',
  'eva-lindgren': 'Eva Lindgren',
  'marianne-lindqvist': 'Marianne Lindqvist',
};

export function profileLabel(p: string): string {
  return PROFILE_LABELS[p] ?? p;
}

/** Kort, läsbart patient-id för syntetiska patienter (t.ex. "multisjuk #106"). */
export function shortPatientLabel(p: ScreenPatient): string {
  const m = p.patientId.match(/-(\d+)$/);
  const n = m ? m[1] : p.patientId.slice(-4);
  return `${profileLabel(p.profile)} #${n}`;
}
