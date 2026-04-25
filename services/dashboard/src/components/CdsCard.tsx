import type { CdsCard as Card } from '../lib/types';

const INDICATOR_STYLES: Record<Card['indicator'], { bg: string; border: string; label: string }> = {
  critical: { bg: 'bg-red-50', border: 'border-core-red', label: 'Kritisk' },
  warning: { bg: 'bg-amber-50', border: 'border-core-amber', label: 'Varning' },
  info: { bg: 'bg-blue-50', border: 'border-blue-400', label: 'Info' },
};

export default function CdsCardView({ card }: { card: Card }) {
  const s = INDICATOR_STYLES[card.indicator];
  return (
    <div className={`border-l-4 ${s.border} ${s.bg} rounded-md p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold">{card.summary}</div>
        <span className="text-xs uppercase tracking-wide text-gray-500">{s.label}</span>
      </div>
      {card.detail && <p className="mt-2 text-sm text-gray-700">{card.detail}</p>}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>{card.source.label}</span>
        {card.suggestions && card.suggestions.length > 0 && (
          <div className="flex gap-2">
            {card.suggestions.map((s) => (
              <button
                key={s.uuid}
                type="button"
                className="rounded-full border border-core-teal px-3 py-1 text-xs text-core-teal hover:bg-core-teal hover:text-white transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
