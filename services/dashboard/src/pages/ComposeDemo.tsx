import { useState } from 'react';
import ObservationTrend from '../components/ObservationTrend';
import { DEMO_ROSTER } from '../lib/demo-roster';

// Compose-sandlåda (Fas 2 AC6). Fristående full-höjd-vy med egen identitet —
// separat från ops-dashboarden, atlasen och med-review-demon.
// "Se skillnaden": Lars faller (grön), Eva stiger (gul), Anders dropout,
// Karin ärligt tomt.

export default function ComposeDemo() {
  const [selected, setSelected] = useState(
    DEMO_ROSTER.find((p) => p.patientId === 'lars-johansson-syn-001') ?? DEMO_ROSTER[0],
  );

  return (
    <div className="h-full flex flex-col bg-[#fafbfc] text-ink">
      {/* Egen identitet */}
      <header className="bg-core-navy text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-bold tracking-tight">Mätvärdestrend</span>
          <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-[3px] bg-[#2A2A4E] text-core-teal border border-[#3a3a5e]">
            Demonstration
          </span>
          <span className="text-[#8b95a5] text-[11px]">Nimloth-plattformen · Fas 2 · Compose</span>
        </div>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-[3px] bg-[#3a2f12] text-core-amber border border-[#5a4a1e]">
          Syntetisk data
        </span>
      </header>

      <div className="bg-white border-b border-line px-6 py-2 text-[12px] text-ink-2">
        <code className="font-mono text-ink">observation_trend_by_period</code> (data-mall) + adaptiv quality-measure-badge —
        <span className="text-ink-3"> två mallar komponerade till en vy</span>
      </div>

      {/* Ankar-väljare */}
      <nav className="px-6 py-3 flex flex-wrap items-center gap-2 border-b border-line bg-white">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mr-1">Ankarpatienter</span>
        {DEMO_ROSTER.map((p) => {
          const active = p.patientId === selected.patientId;
          return (
            <button
              key={p.patientId}
              onClick={() => setSelected(p)}
              title={p.label}
              className={`px-3 py-1.5 rounded text-[13px] border transition ${
                active
                  ? 'border-core-teal bg-core-teal text-white font-medium'
                  : 'border-line bg-white text-ink-2 hover:border-[#8b95a5]'
              }`}
            >
              {p.displayName.split(' ')[0]}
              <span className={`ml-1 tabular-nums ${active ? 'text-[#b7dadb]' : 'text-ink-3'}`}> · {p.age}</span>
            </button>
          );
        })}
      </nav>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold text-ink">
              {selected.displayName} <span className="text-ink-3 font-normal tabular-nums">· {selected.age} år</span>
            </h2>
            <p className="text-[12px] text-ink-2">{selected.label}</p>
          </div>

          <ObservationTrend patientId={selected.patientId} />

          <p className="text-[11px] text-ink-3 mt-3">Förväntat: {selected.expectation}</p>
        </div>
      </main>
    </div>
  );
}
