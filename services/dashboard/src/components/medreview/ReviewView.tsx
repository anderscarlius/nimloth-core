import { useEffect, useRef, useState } from 'react';
import { DEMO_ROSTER } from '../../lib/demo-roster';
import {
  streamMedReview,
  type Finding,
  type MedReviewEvent,
} from '../../lib/med-review-client';
import type { ReviewTarget } from '../../lib/screening';

interface MedRow { name: string; atc: string }
interface DiagRow { name: string; icd: string }
interface TrendRow { timestamp: string; analyte: string; magnitude: number; unit: string }
interface AllergyRow { substanceName: string; substanceCode: string; criticality: string; reactionType: string }
interface AuditRow { templateId: string; at: string; rowCount: number; ms: number }
interface StepRow { step: string; label: string; status: 'start' | 'done'; ms?: number }

const SEV_STYLE: Record<Finding['severity'], string> = {
  high: 'border border-[#f0d5d3] border-l-2 border-l-core-red bg-[#fbeceb]',
  moderate: 'border border-[#efe4c4] border-l-2 border-l-core-amber bg-[#fdf6e3]',
  low: 'border border-line border-l-2 border-l-[#8b95a5] bg-[#f7f8fa]',
};
const SEV_BADGE: Record<Finding['severity'], string> = {
  high: 'bg-core-red text-white',
  moderate: 'bg-core-amber text-white',
  low: 'bg-[#8b95a5] text-white',
};

const ANCHORS: ReviewTarget[] = DEMO_ROSTER.map((p) => ({
  patientId: p.patientId,
  displayName: p.displayName,
  age: p.age,
}));

export default function ReviewView({
  target,
  debugInject,
}: {
  target?: ReviewTarget;
  debugInject?: 'force_unsourced';
}) {
  const [selected, setSelected] = useState<ReviewTarget>(target ?? ANCHORS[4]);
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

  function start(p: ReviewTarget) {
    closeRef.current?.();
    reset();
    setRunning(true);
    closeRef.current = streamMedReview(p.patientId, p.age, {
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
    }, debugInject);
  }

  // Auto-kör när en patient valts från screening/bläddrare (target ändras).
  useEffect(() => {
    if (target) {
      setSelected(target);
      start(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.patientId]);

  useEffect(() => () => closeRef.current?.(), []);

  return (
    <div className="flex flex-col h-full">
      {/* Patient-väljare (ankare) + aktiv patient */}
      <nav className="px-6 py-3 flex flex-wrap items-center gap-2 border-b border-line bg-white">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mr-1">Ankarpatienter</span>
        {ANCHORS.map((p) => {
          const active = p.patientId === selected.patientId;
          return (
            <button
              key={p.patientId}
              onClick={() => setSelected(p)}
              disabled={running}
              className={`px-3 py-1.5 rounded text-[13px] border transition disabled:opacity-50 ${
                active ? 'border-core-teal bg-core-teal text-white font-medium' : 'border-line bg-white text-ink-2 hover:border-[#8b95a5]'
              }`}
            >
              {p.displayName.split(' ')[0]}
              <span className={`ml-1 tabular-nums ${active ? 'text-[#b7dadb]' : 'text-ink-3'}`}>· {p.age}</span>
            </button>
          );
        })}
        <button
          onClick={() => start(selected)}
          disabled={running}
          className="ml-auto px-4 py-1.5 rounded-md text-[13px] font-medium bg-core-teal text-white hover:bg-core-teal-dark disabled:opacity-50"
        >
          {running ? 'Kör genomgång…' : `Starta genomgång — ${selected.displayName.split(' ')[0]}`}
        </button>
      </nav>

      {/* Aktiv patient + steg-strip */}
      <div className="px-6 py-2 border-b border-line bg-white flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-ink-2">
          Analyserar:{' '}
          <span className="font-semibold text-ink">{selected.displayName}</span>
          {selected.subtitle && <span className="text-ink-3"> · {selected.subtitle}</span>}
          <span className="font-mono text-ink-3"> · {selected.patientId}</span>
        </span>
        <span className="text-line-2">|</span>
        {steps.length === 0 && <span className="text-ink-3">väntar…</span>}
        {steps.filter((s) => s.status === 'done').map((s, i) => (
          <span key={i} className="px-2 py-0.5 rounded-[3px] bg-[#e8f3ec] text-core-green border border-[#cce6d5]">
            ✓ {s.label}{s.ms != null ? ` · ${s.ms}ms` : ''}
          </span>
        ))}
        {running && steps.at(-1)?.status === 'start' && (
          <span className="px-2 py-0.5 rounded-[3px] bg-[#e6f2f3] text-core-teal border border-[#bfe0e1] animate-pulse">
            ⋯ {steps.at(-1)?.label}
          </span>
        )}
      </div>

      {/* Tre kolumner */}
      <main className="flex-1 overflow-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 bg-[#fafbfc]">
        <section className="bg-white border border-line rounded-[3px] p-4 overflow-auto">
          <ColHead>Patientdata</ColHead>
          <Panel title={`Mediciner (${meds.length})`}>{meds.map((m, i) => <Row key={i} a={m.atc} b={m.name} />)}</Panel>
          <Panel title={`Diagnoser (${diags.length})`}>{diags.map((d, i) => <Row key={i} a={d.icd} b={d.name} />)}</Panel>
          <Panel title={`HbA1c-trend (${trend.length})`}>
            {trend.length === 0 ? <Empty /> : trend.map((t, i) => <Row key={i} a={t.timestamp.slice(0, 10)} b={`${t.magnitude} ${t.unit}`} />)}
          </Panel>
          <Panel title={`Allergier (${allergies.length})`}>
            {allergies.length === 0 ? <Empty /> : allergies.map((a, i) => <Row key={i} a={a.substanceCode} b={`${a.substanceName} (${a.criticality}, ${a.reactionType})`} />)}
          </Panel>
        </section>

        <section className="bg-white border border-line rounded-[3px] p-4 overflow-auto">
          <ColHead>Fynd ({findings.length}) · deterministiska regelmotorer</ColHead>
          {findings.length === 0 && !running && <Empty />}
          <div className="space-y-2">
            {findings.map((f) => (
              <div key={f.id} className={`rounded-[3px] p-3 ${SEV_STYLE[f.severity]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[3px] ${SEV_BADGE[f.severity]}`}>{f.severity.toUpperCase()}</span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-3">{f.kind}</span>
                </div>
                <div className="font-semibold text-[13px] text-ink leading-snug">{f.title}</div>
                <div className="text-[12px] text-ink-2 mt-1 leading-relaxed">{f.consequence}</div>
                <div className="text-[11px] text-ink-3 mt-1.5">Källa: {f.sources.map((s) => s.label).join(', ')}</div>
              </div>
            ))}
          </div>
          {(narrative || running) && (
            <div className="mt-4 border-t border-line pt-3">
              <ColHead>
                Sammanfattning{' '}
                {narrSource && (
                  <span className="text-ink-3 normal-case font-normal tracking-normal">
                    · {narrSource === 'llm' ? 'Claude-syntes (S1-validerad)' : 'deterministisk'}
                  </span>
                )}
              </ColHead>
              {rejected && (
                <div className="mb-2 rounded-[3px] border border-[#f0d5d3] border-l-2 border-l-core-red bg-[#fbeceb] p-2.5 text-[11px] text-[#7a211c]">
                  <div className="font-semibold">⚠ Syntes avvisad av S1-validering — visar deterministiskt underlag</div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">{rejected.map((v, i) => <li key={i}>{v}</li>)}</ul>
                </div>
              )}
              <pre className="text-[13px] text-ink-2 whitespace-pre-wrap font-sans leading-relaxed">{narrative || '⋯'}</pre>
            </div>
          )}
        </section>

        <section className="bg-white border border-line rounded-[3px] p-4 overflow-auto">
          <ColHead>Audit-tidslinje · PDL-spårbarhet ({audit.length})</ColHead>
          {audit.length === 0 && !running && <Empty />}
          <ol className="space-y-2">
            {audit.map((a, i) => (
              <li key={i} className="text-[12px] border-l-2 border-core-teal pl-2.5 py-0.5">
                <div className="font-mono text-ink">{a.templateId.split('.').pop()}</div>
                <div className="text-ink-3 tabular-nums">{a.rowCount} rader · {a.ms}ms · {a.at.slice(11, 19)}</div>
              </li>
            ))}
          </ol>
          {done && (
            <div className="mt-3 text-[12px] text-ink-2 border-t border-line pt-2">
              <span className="font-semibold text-core-green">✓ Klar</span> · {done.findingCount} fynd · {done.totalMs}ms · {audit.length} dataaccesser loggade
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ColHead({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-3">{children}</h2>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-medium text-ink-2 mb-1.5">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function Row({ a, b }: { a: string; b: string }) {
  return (
    <div className="text-[12px] flex gap-2">
      <span className="font-mono text-ink-3 shrink-0 w-20">{a}</span>
      <span className="text-ink">{b}</span>
    </div>
  );
}
function Empty() {
  return <div className="text-[12px] text-ink-3 italic">—</div>;
}
