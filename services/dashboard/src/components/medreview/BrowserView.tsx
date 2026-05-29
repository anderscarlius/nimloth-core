import { useEffect, useMemo, useState } from 'react';
import {
  loadScreening,
  profileLabel,
  shortPatientLabel,
  type ScreeningData,
  type ScreenPatient,
  type ReviewTarget,
} from '../../lib/screening';

const SEV_BADGE: Record<string, string> = {
  high: 'bg-core-red text-white',
  moderate: 'bg-core-amber text-white',
  low: 'bg-[#8b95a5] text-white',
};

export default function BrowserView({ onOpenReview }: { onOpenReview: (t: ReviewTarget) => void }) {
  const [data, setData] = useState<ScreeningData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  useEffect(() => {
    loadScreening().then(setData).catch((e) => setError(String(e)));
  }, []);

  const profiles = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byProfile)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([k, v]) => ({ key: k, total: v.total }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.patients.filter((p) => {
      if (profile !== 'all' && p.profile !== profile) return false;
      if (onlyFlagged && p.findingCount === 0) return false;
      if (q && !p.patientId.toLowerCase().includes(q) && !profileLabel(p.profile).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, profile, query, onlyFlagged]);

  if (error) return <div className="p-6 text-[13px] text-core-red">Kunde inte ladda patienter: {error}</div>;
  if (!data) return <div className="p-6 text-[13px] text-ink-3">Laddar patientregister…</div>;

  return (
    <div className="flex-1 overflow-auto bg-[#fafbfc] p-6">
      <div className="mb-3">
        <h2 className="text-[15px] font-semibold text-ink">Patientregister</h2>
        <p className="text-[12px] text-ink-2 mt-0.5">
          Hela den syntetiska populationen ({data.totals.patients} EHR i EHRbase) · filtrera per profil, kör genomgång på vilken som helst.
          <span className="text-ink-3"> Syntetiska patienter saknar namn/personnummer — sök på profil eller id.</span>
        </p>
      </div>

      {/* Filter */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sök på profil eller patient-id…"
          className="rounded-md border border-line px-3 py-1.5 text-[13px] w-64 focus:border-core-teal focus:outline-none focus:ring-1 focus:ring-core-teal"
        />
        <label className="text-[12px] text-ink-2 flex items-center gap-1.5 ml-1">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Endast flaggade
        </label>
        <span className="ml-auto text-[12px] text-ink-3 tabular-nums">{filtered.length} patienter</span>
      </div>

      {/* Profil-chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <ProfileChip active={profile === 'all'} onClick={() => setProfile('all')} label="Alla" count={data.totals.patients} />
        {profiles.map((p) => (
          <ProfileChip key={p.key} active={profile === p.key} onClick={() => setProfile(p.key)} label={profileLabel(p.key)} count={p.total} />
        ))}
      </div>

      {/* Lista */}
      <div className="bg-white border border-line rounded-[3px] divide-y divide-line-2 max-h-[560px] overflow-auto">
        {filtered.slice(0, 400).map((p) => (
          <PatientRow key={p.patientId} p={p} onOpen={onOpenReview} />
        ))}
        {filtered.length > 400 && (
          <div className="px-3 py-2 text-[11px] text-ink-3">Visar första 400 av {filtered.length} — förfina filtret.</div>
        )}
        {filtered.length === 0 && <div className="px-3 py-3 text-[12px] text-ink-3 italic">Inga patienter matchar filtret.</div>}
      </div>
    </div>
  );
}

function ProfileChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-[12px] border transition ${
        active ? 'border-core-teal bg-core-teal text-white font-medium' : 'border-line bg-white text-ink-2 hover:border-[#8b95a5]'
      }`}
    >
      {label} <span className={`tabular-nums ${active ? 'text-[#b7dadb]' : 'text-ink-3'}`}>{count}</span>
    </button>
  );
}

function PatientRow({ p, onOpen }: { p: ScreenPatient; onOpen: (t: ReviewTarget) => void }) {
  const label = shortPatientLabel(p);
  return (
    <button
      type="button"
      onClick={() => onOpen({ patientId: p.patientId, displayName: label, subtitle: profileLabel(p.profile) })}
      className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-[#fafbfc] transition"
    >
      <span className="text-[13px] text-ink font-medium w-44 shrink-0 truncate">{label}</span>
      <span className="font-mono text-[11px] text-ink-3 w-52 shrink-0 truncate">{p.patientId}</span>
      <span className="text-[11px] text-ink-2 tabular-nums shrink-0 w-24">{p.medCount} läkem.</span>
      <span className="flex-1" />
      {p.findingCount > 0 && p.maxSeverity ? (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[3px] shrink-0 ${SEV_BADGE[p.maxSeverity]}`}>
          {p.findingCount} fynd
        </span>
      ) : (
        <span className="text-[11px] text-ink-3 shrink-0">inga fynd</span>
      )}
    </button>
  );
}
