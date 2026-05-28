// SSE-klient mot med-review-orkestratorn (Fas 3 AC6). Proxas via /api/med-review.

export interface Finding {
  id: string;
  kind: 'interaction' | 'contraindication' | 'beers_stopp';
  severity: 'low' | 'moderate' | 'high';
  title: string;
  involved: string[];
  mechanism: string;
  consequence: string;
  clinicalNote: string;
  sources: { label: string; ref: string }[];
}

export type MedReviewEvent =
  | { type: 'step'; step: string; status: 'start' | 'done'; label: string; ms?: number }
  | { type: 'data'; panel: 'medications' | 'diagnoses' | 'trend' | 'allergies'; rows: unknown[] }
  | { type: 'audit'; templateId: string; patientId: string; at: string; rowCount: number; ms: number }
  | { type: 'finding'; finding: Finding }
  | { type: 'narrative_delta'; text: string }
  | { type: 'narrative'; text: string; source: 'llm' | 'deterministic' }
  | { type: 'synthesis_rejected'; violations: string[] }
  | { type: 'done'; findingCount: number; totalMs: number }
  | { type: 'error'; message: string };

export interface StreamHandlers {
  onEvent: (e: MedReviewEvent) => void;
  onEnd?: () => void;
  onError?: () => void;
}

/** Öppnar SSE-strömmen för en patient. Returnerar en stäng-funktion. */
export function streamMedReview(
  patientId: string,
  age: number | undefined,
  handlers: StreamHandlers,
): () => void {
  const ageQuery = age != null ? `?age=${age}` : '';
  const es = new EventSource(`/api/med-review/${encodeURIComponent(patientId)}/stream${ageQuery}`);

  es.onmessage = (e) => {
    try {
      handlers.onEvent(JSON.parse(e.data) as MedReviewEvent);
    } catch {
      /* ignorera malformed delta */
    }
  };
  es.addEventListener('end', () => {
    es.close();
    handlers.onEnd?.();
  });
  es.onerror = () => {
    es.close();
    handlers.onError?.();
  };

  return () => es.close();
}
