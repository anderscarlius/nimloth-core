import { useState } from 'react';
import ReviewView from '../components/medreview/ReviewView';
import ScreeningView from '../components/medreview/ScreeningView';
import BrowserView from '../components/medreview/BrowserView';
import type { ReviewTarget } from '../lib/screening';

// Fristående demo-yta — INTE ops-dashboarden, INTE atlasen. En separat, tydlig
// visning av hur AI-medicineringsgenomgången fungerar (Nimloth som plattform).

// DEMO-flagga (aldrig default): ?debug_inject=force_unsourced tvingar S1-avvisning.
const DEBUG_INJECT =
  new URLSearchParams(window.location.search).get('debug_inject') === 'force_unsourced'
    ? ('force_unsourced' as const)
    : undefined;

type View = 'screening' | 'browser' | 'review';

const TABS: { id: View; label: string }[] = [
  { id: 'screening', label: 'Populationsscreening' },
  { id: 'browser', label: 'Patientregister' },
  { id: 'review', label: 'Genomgång' },
];

export default function MedReview() {
  const [view, setView] = useState<View>('screening');
  const [target, setTarget] = useState<ReviewTarget | undefined>(undefined);

  function openReview(t: ReviewTarget) {
    setTarget(t);
    setView('review');
  }

  return (
    <div className="h-full flex flex-col bg-[#fafbfc] text-ink">
      {/* Egen identitet — separat från Nimloth Core-dashboarden och atlasen */}
      <header className="bg-core-navy text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-base font-bold tracking-tight">AI-medicineringsgenomgång</span>
          <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-[3px] bg-[#2A2A4E] text-core-teal border border-[#3a3a5e]">
            Demonstration
          </span>
          <span className="text-[#8b95a5] text-[11px]">Nimloth-plattformen · Fas 3</span>
        </div>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-[3px] bg-[#3a2f12] text-core-amber border border-[#5a4a1e]">
          Ej medicinteknisk produkt · ej beslutsstöd · syntetisk data
        </span>
      </header>

      {/* Intern navigering */}
      <nav className="bg-white border-b border-line px-6 flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            className={`px-3 py-2.5 text-[13px] border-b-2 -mb-px transition ${
              view === tab.id
                ? 'border-core-teal text-ink font-semibold'
                : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-3 text-[11px] text-ink-3 hidden md:inline">
          Deterministiska regelmotorer bedömer · LLM syntetiserar, fattar inga beslut (S1)
        </span>
      </nav>

      {DEBUG_INJECT && (
        <div className="bg-[#fbeafb] border-b border-[#e9c7e9] px-6 py-1.5 text-[11px] font-semibold text-[#9b2c9b]">
          ⚙ DEBUG-INJECT ({DEBUG_INJECT}) AKTIV — syntesen bypassas med känd osourcerad text för att demonstrera S1-avvisning. INTE äkta drift.
        </div>
      )}

      {/* Vy-yta — alla monterade, dolda toggle (undviker omkörning vid flik-byte) */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className={`flex-1 min-h-0 flex flex-col ${view === 'screening' ? '' : 'hidden'}`}>
          <ScreeningView onOpenReview={openReview} />
        </div>
        <div className={`flex-1 min-h-0 flex flex-col ${view === 'browser' ? '' : 'hidden'}`}>
          <BrowserView onOpenReview={openReview} />
        </div>
        <div className={`flex-1 min-h-0 flex flex-col ${view === 'review' ? '' : 'hidden'}`}>
          <ReviewView target={target} debugInject={DEBUG_INJECT} />
        </div>
      </div>
    </div>
  );
}
