import { useState } from 'react';
import ObservationTrend from '../components/ObservationTrend';
import { DEMO_ROSTER } from '../lib/demo-roster';

// Compose-sandlåda (Fas 2 AC6). Egen full-höjd-vy (utanför standard-Layout).
// Kompakt horisontell ankar-väljare + Mätvärdestrend ovanför fold.
// "Se skillnaden": Lars faller (grön), Eva stiger (gul), Anders dropout,
// Karin ärligt tomt.

export default function ComposeDemo() {
  const [selected, setSelected] = useState(
    DEMO_ROSTER.find((p) => p.patientId === 'lars-johansson-syn-001') ?? DEMO_ROSTER[0],
  );

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <header className="px-6 pt-5 pb-3 border-b bg-white">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-gray-800">Compose-sandlåda</h1>
          <span className="text-xs text-gray-400">
            <code>observation_trend_by_period</code> (data-query) + adaptiv quality-measure-badge — två mallar, en vy
          </span>
        </div>
      </header>

      {/* Kompakt horisontell väljare — chips, ryms ovanför fold */}
      <nav className="px-6 py-3 flex flex-wrap gap-2 border-b bg-white">
        {DEMO_ROSTER.map((p) => {
          const active = p.patientId === selected.patientId;
          return (
            <button
              key={p.patientId}
              onClick={() => setSelected(p)}
              title={p.label}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                active
                  ? 'border-blue-500 bg-blue-600 text-white font-medium'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              {p.displayName.split(' ')[0]}
              <span className={active ? 'text-blue-200' : 'text-gray-400'}> · {p.age}</span>
            </button>
          );
        })}
      </nav>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-gray-800">
              {selected.displayName} <span className="text-gray-400 font-normal">· {selected.age} år</span>
            </h2>
            <p className="text-sm text-gray-500">{selected.label}</p>
          </div>

          <ObservationTrend patientId={selected.patientId} />

          <p className="text-xs text-gray-400 mt-3">
            Förväntat: {selected.expectation}
          </p>
        </div>
      </main>
    </div>
  );
}
