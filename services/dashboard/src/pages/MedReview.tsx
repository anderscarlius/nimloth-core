import { useEffect, useRef, useState } from 'react';
import { DEMO_ROSTER } from '../lib/demo-roster';
import {
  streamMedReview,
  type Finding,
  type MedReviewEvent,
} from '../lib/med-review-client';

interface MedRow { name: string; atc: string }
interface DiagRow { name: string; icd: string }
interface TrendRow { timestamp: string; analyte: string; magnitude: number; unit: string }
interface AllergyRow { substanceName: string; substanceCode: string; criticality: string; reactionType: string }
interface AuditRow { templateId: string; at: string; rowCount: number; ms: number }
interface StepRow { step: string; label: string; status: 'start' | 'done'; ms?: number }

const SEV_STYLE: Record<Finding['severity'], string> = {
  high: 'border-rose-300 bg-rose-50',
  moderate: 'border-amber-300 bg-amber-50',
  low: 'border-gray-200 bg-gray-50',
};
const SEV_BADGE: Record<Finding['severity'], string> = {
  high: 'bg-rose-600 text-white',
  moderate: 'bg-amber-500 text-white',
  low: 'bg-gray-400 text-white',
};

export default function MedReview() {
  const [selected, setSelected] = useState(DEMO_ROSTER[4]); // Lars default
  const [running, setRunning] = useState(false);
  const [meds, setMeds] = useState<MedRow[]>([]);
  const [diags, setDiags] = useState<DiagRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [allergies, setAllergies] = useState<AllergyRow[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [narrative, setNarrative] = useState('');
  const [narrSource, setNarrSource] = useState<'llm' | 'deterministic' | null>(null);
  const [rejected, setRejected] = useState<string[] | null>(null);
  const [done, setDone] = useState<{ findingCount: number; totalMs: number } | null>(null);
  const closeRef = useRef<(() => void) | null>(null);

  function reset() {
    setMeds([]); setDiags([]); setTrend([]); setAllergies([]);
    setFindings([]); setAudit([]); setSteps([]); setNarrative('');
    setNarrSource(null); setRejected(null); setDone(null);
  }

  function start(patientId: string, age?: number) {
    closeRef.current?.();
    reset();
    setRunning(true);
    closeRef.current = streamMedReview(patientId, age, {
      onEvent: (e: MedReviewEvent) => {
        switch (e.type) {
          case 'data':
            if (e.panel === 'medications') setMeds(e.rows as MedRow[]);
            else if (e.panel === 'diagnoses') setDiags(e.rows as DiagRow[]);
            else if (e.panel === 'trend') setTrend(e.rows as TrendRow[]);
            else if (e.panel === 'allergies') setAllergies(e.rows as AllergyRow[]);
            break;
          case 'audit':
            setAudit((a) => [...a, { templateId: e.templateId, at: e.at, rowCount: e.rowCount, ms: e.ms }]);
            break;
          case 'step':
            setSteps((s) => [...s, { step: e.step, label: e.label, status: e.status, ms: e.ms }]);
            break;
          case 'finding':
            setFindings((f) => [...f, e.finding]);
            break;
          case 'narrative_delta':
            setNarrative((n) => n + e.text);
            break;
          case 'narrative':
            setNarrative(e.text);
            setNarrSource(e.source);
            break;
          case 'synthesis_rejected':
            setRejected(e.violations);
            break;
          case 'done':
            setDone({ findingCount: e.findingCount, totalMs: e.totalMs });
            setRunning(false);
            break;
          case 'error':
            setNarrative((n) => n + `\n[Fel: ${e.message}]`);
            setRunning(false);
            break;
        }
      },
      onEnd: () => setRunning(false),
      onError: () => setRunning(false),
    });
  }

  // Stäng strömmen vid unmount
  useEffect(() => () => closeRef.current?.(), []);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <header className="px-6 pt-5 pb-3 border-b bg-white">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">AI-medicineringsgenomgång</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Deterministiska regelmotorer (interaktion + Beers/STOPP) · LLM syntetiserar, fattar inga beslut
            </p>
          </div>
          <span className="text-xs font-medium px-2.5 py-1 rounded bg-yellow-100 text-yellow-800 border border-yellow-300">
            Demonstration — ej medicinteknisk produkt, ej beslutsstöd · syntetisk data
          </span>
        </div>
      </header>

      {/* Patient-väljare */}
      <nav className="px-6 py-3 flex flex-wrap items-center gap-2 border-b bg-white">
        {DEMO_ROSTER.map((p) => {
          const active = p.patientId === selected.patientId;
          return (
            <button
              key={p.patientId}
              onClick={() => setSelected(p)}
              disabled={running}
              className={`px-3 py-1.5 rounded-full text-sm border transition disabled:opacity-50 ${
                active ? 'border-blue-500 bg-blue-600 text-white font-medium' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              {p.displayName.split(' ')[0]} <span className={active ? 'text-blue-200' : 'text-gray-400'}>· {p.age}</span>
            </button>
          );
        })}
        <button
          onClick={() => start(selected.patientId, selected.age)}
          disabled={running}
          className="ml-auto px-4 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? 'Kör genomgång…' : `Starta genomgång för ${selected.displayName.split(' ')[0]}`}
        </button>
      </nav>

      {/* Steg-strip */}
      <div className="px-6 py-2 border-b bg-white flex flex-wrap gap-1.5 text-xs">
        {steps.length === 0 && <span className="text-gray-400">Väntar på start…</span>}
        {steps.filter((s) => s.status === 'done').map((s, i) => (
          <span key={i} className="px-2 py-0.5 rounded bg-green-100 text-green-700">
            ✓ {s.label}{s.ms != null ? ` (${s.ms}ms)` : ''}
          </span>
        ))}
        {running && steps.at(-1)?.status === 'start' && (
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 animate-pulse">⋯ {steps.at(-1)?.label}</span>
        )}
      </div>

      {/* Tre kolumner */}
      <main className="flex-1 overflow-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Kol 1 — Data */}
        <section className="bg-white border rounded-md p-3 overflow-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Patientdata</h2>
          <Panel title={`Mediciner (${meds.length})`}>
            {meds.map((m, i) => <Row key={i} a={m.atc} b={m.name} />)}
          </Panel>
          <Panel title={`Diagnoser (${diags.length})`}>
            {diags.map((d, i) => <Row key={i} a={d.icd} b={d.name} />)}
          </Panel>
          <Panel title={`HbA1c-trend (${trend.length})`}>
            {trend.length === 0 ? <Empty /> : trend.map((t, i) => <Row key={i} a={t.timestamp.slice(0, 10)} b={`${t.magnitude} ${t.unit}`} />)}
          </Panel>
          <Panel title={`Allergier (${allergies.length})`}>
            {allergies.length === 0 ? <Empty /> : allergies.map((a, i) => <Row key={i} a={a.substanceCode} b={`${a.substanceName} (${a.criticality}, ${a.reactionType})`} />)}
          </Panel>
        </section>

        {/* Kol 2 — Fynd + narrativ */}
        <section className="bg-white border rounded-md p-3 overflow-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Fynd ({findings.length}) — deterministiska regelmotorer
          </h2>
          {findings.length === 0 && !running && <Empty />}
          <div className="space-y-2">
            {findings.map((f) => (
              <div key={f.id} className={`border rounded-md p-2.5 ${SEV_STYLE[f.severity]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SEV_BADGE[f.severity]}`}>{f.severity.toUpperCase()}</span>
                  <span className="text-[10px] text-gray-500">{f.kind}</span>
                </div>
                <div className="font-medium text-sm text-gray-800">{f.title}</div>
                <div className="text-xs text-gray-600 mt-1">{f.consequence}</div>
                <div className="text-[11px] text-gray-400 mt-1">Källa: {f.sources.map((s) => s.label).join(', ')}</div>
              </div>
            ))}
          </div>
          {(narrative || running) && (
            <div className="mt-4 border-t pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Sammanfattning {narrSource && <span className="text-gray-400 normal-case">· {narrSource === 'llm' ? 'Claude-syntes (S1-validerad)' : 'deterministisk'}</span>}
              </h3>
              {rejected && (
                <div className="mb-2 rounded border border-rose-300 bg-rose-50 p-2 text-[11px] text-rose-800">
                  <div className="font-semibold">⚠ Syntes avvisad av S1-validering — visar deterministiskt underlag</div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {rejected.map((v, i) => <li key={i}>{v}</li>)}
                  </ul>
                </div>
              )}
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{narrative || '⋯'}</pre>
            </div>
          )}
        </section>

        {/* Kol 3 — Audit-tidslinje */}
        <section className="bg-white border rounded-md p-3 overflow-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Audit-tidslinje — PDL-spårbarhet ({audit.length})
          </h2>
          {audit.length === 0 && !running && <Empty />}
          <ol className="space-y-1.5">
            {audit.map((a, i) => (
              <li key={i} className="text-xs border-l-2 border-blue-300 pl-2 py-0.5">
                <div className="font-mono text-gray-700">{a.templateId.split('.').pop()}</div>
                <div className="text-gray-400">{a.rowCount} rader · {a.ms}ms · {a.at.slice(11, 19)}</div>
              </li>
            ))}
          </ol>
          {done && (
            <div className="mt-3 text-xs text-gray-500 border-t pt-2">
              Klar: {done.findingCount} fynd, {done.totalMs}ms · {audit.length} dataaccesser loggade
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-medium text-gray-600 mb-1">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
function Row({ a, b }: { a: string; b: string }) {
  return (
    <div className="text-xs flex gap-2">
      <span className="font-mono text-gray-500 shrink-0">{a}</span>
      <span className="text-gray-700">{b}</span>
    </div>
  );
}
function Empty() {
  return <div className="text-xs text-gray-400 italic">—</div>;
}
