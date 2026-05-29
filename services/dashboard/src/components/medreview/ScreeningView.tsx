import { useEffect, useMemo, useState } from 'react';
import {
  loadScreening,
  profileLabel,
  shortPatientLabel,
  type ScreeningData,
  type ScreenPatient,
  type ReviewTarget,
} from '../../lib/screening';

const SEV_RANK: Record<string, number> = { high: 3, moderate: 2, low: 1 };
const SEV_BADGE: Record<string, string> = {
  high: 'bg-core-red text-white',
  moderate: 'bg-core-amber text-white',
  low: 'bg-[#8b95a5] text-white',
};

export default function ScreeningView({ onOpenReview }: { onOpenReview: (t: ReviewTarget) => void }) {
  const [data, setData] = useState<ScreeningData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScreening().then(setData).catch((e) => setError(String(e)));
  }, []);

  const flagged = useMemo(() => {
    if (!data) return [];
    return data.patients
      .filter((p) => p.findingCount > 0)
      .sort((a, b) => {
        const sa = a.maxSeverity ? SEV_RANK[a.maxSeverity] : 0;
        const sb = b.maxSeverity ? SEV_RANK[b.maxSeverity] : 0;
        if (sb !== sa) return sb - sa;
        return b.findingCount - a.findingCount;
      });
  }, [data]);

  const ageIndependent = useMemo(
    () => (data ? data.patients.filter((p) => p.interaction > 0 || p.contraindication > 0).length : 0),
    [data],
  );

  if (error) return <div className="p-6 text-[13px] text-core-red">Kunde inte ladda screening: {error}</div>;
  if (!data) return <div className="p-6 text-[13px] text-ink-3">Laddar populationsscreening…</div>;

  const t = data.totals;
  const ran = new Date(data.generatedAt).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex-1 overflow-auto bg-[#fafbfc] p-6">
      {/* Rubrik */}
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-ink">Populationsscreening</h2>
        <p className="text-[12px] text-ink-2 mt-0.5">
          De deterministiska regelmotorerna körda över <span className="font-semibold tabular-nums">{t.patients}</span> patienter ·
          senast körd {ran} · {(data.elapsedMs / 1000).toFixed(0)}s · {t.failed} fel
        </p>
      </div>

      {/* Statkort — ÅLDERSOBEROENDE primärt, Beers/STOPP sekundärt */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Åldersoberoende fynd" value={ageIndependent} accent="red"
          sub="interaktion + kontraindikation — solida oavsett ålder" />
        <Stat label="Warfarin + SSRI (high)" value={t.withInteraction} accent="red"
          sub="ökad blödningsrisk" />
        <Stat label="Kontraindikation" value={t.withContraindication} accent="red"
          sub="penicillinallergi + penicillin" />
        <Stat label="Beers/STOPP-flagga" value={t.withBeersStopp} accent="amber"
          sub="ålder okänd → antar äldre" />
      </div>

      {/* Ärlighets-box */}
      <div className="mb-5 rounded-[3px] border border-line bg-white p-3 text-[11px] text-ink-2 leading-relaxed">
        <span className="font-semibold text-ink">Ärlig avgränsning.</span> {data.ageNote} {data.ruleScopeNote}
        {' '}Totalt <span className="font-semibold tabular-nums">{t.flagged}</span> av {t.patients} patienter fick minst ett fynd
        ({t.high} med high-severity). Demonstration — ej medicinteknisk produkt, syntetisk data.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Per profil */}
        <section className="bg-white border border-line rounded-[3px] p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-3">Flaggade per profil</h3>
          <div className="space-y-2">
            {Object.entries(data.byProfile)
              .filter(([, v]) => v.flagged > 0)
              .sort((a, b) => b[1].flagged - a[1].flagged)
              .map(([prof, v]) => (
                <div key={prof}>
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-ink">{profileLabel(prof)}</span>
                    <span className="text-ink-3 tabular-nums">{v.flagged}/{v.total}</span>
                  </div>
                  <div className="h-1.5 bg-line-2 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-core-teal" style={{ width: `${(v.flagged / v.total) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>
        </section>

        {/* Flaggade patienter (klickbara → genomgång) */}
        <section className="bg-white border border-line rounded-[3px] p-4 lg:col-span-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-3">
            Flaggade patienter ({flagged.length}) · klicka för full genomgång
          </h3>
          <div className="space-y-1 max-h-[480px] overflow-auto">
            {flagged.map((p) => (
              <PatientRow key={p.patientId} p={p} onOpen={onOpenReview} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: number; sub: string; accent: 'red' | 'amber' }) {
  const color = accent === 'red' ? 'text-core-red' : 'text-core-amber';
  return (
    <div className="bg-white border border-line rounded-[3px] p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${color}`}>{value}</div>
      <div className="text-[11px] text-ink-3 mt-0.5 leading-tight">{sub}</div>
    </div>
  );
}

function PatientRow({ p, onOpen }: { p: ScreenPatient; onOpen: (t: ReviewTarget) => void }) {
  const label = shortPatientLabel(p);
  const top = p.findings[0]?.title ?? '';
  return (
    <button
      type="button"
      onClick={() => onOpen({ patientId: p.patientId, displayName: label, subtitle: profileLabel(p.profile) })}
      className="w-full text-left flex items-center gap-3 px-2.5 py-2 rounded-[3px] border border-transparent hover:border-line hover:bg-[#fafbfc] transition"
    >
      {p.maxSeverity && (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[3px] shrink-0 ${SEV_BADGE[p.maxSeverity]}`}>
          {p.maxSeverity.toUpperCase()}
        </span>
      )}
      <span className="text-[13px] text-ink font-medium shrink-0 w-40 truncate">{label}</span>
      <span className="text-[12px] text-ink-2 flex-1 truncate">{top}</span>
      <span className="text-[11px] text-ink-3 tabular-nums shrink-0">
        {p.findingCount} fynd · {p.medCount} läkem.
      </span>
    </button>
  );
}
