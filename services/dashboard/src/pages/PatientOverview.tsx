import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEverything, getCdsCards, entriesByType } from '../lib/fhir-client';
import type {
  FhirPatient,
  FhirMedicationStatement,
  FhirProcedure,
  FhirCondition,
  FhirObservation,
  FhirAllergyIntolerance,
} from '../lib/types';
import CdsCardView from '../components/CdsCard';
import MedicationList from '../components/MedicationList';
import LabResults from '../components/LabResults';
import ProcedureHistory from '../components/ProcedureHistory';
import VitalSigns from '../components/VitalSigns';
import TimelineView from '../components/TimelineView';

type TabKey = 'timeline' | 'medications' | 'labs' | 'conditions' | 'procedures' | 'vitals';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'timeline', label: 'Tidslinje' },
  { key: 'medications', label: 'Läkemedel' },
  { key: 'labs', label: 'Labb' },
  { key: 'conditions', label: 'Diagnoser' },
  { key: 'procedures', label: 'Operationer' },
  { key: 'vitals', label: 'Vitala' },
];

function ageFromBirthDate(bd: string | undefined): number | null {
  if (!bd) return null;
  const birth = new Date(bd);
  if (Number.isNaN(birth.getTime())) return null;
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 86400 * 1000));
}

export default function PatientOverview() {
  const { pnr = '' } = useParams();
  const [tab, setTab] = useState<TabKey>('timeline');

  const everything = useQuery({
    queryKey: ['everything', pnr],
    queryFn: () => getEverything(pnr),
    enabled: pnr.length > 0,
  });

  const cds = useQuery({
    queryKey: ['cds', pnr],
    queryFn: () => getCdsCards(pnr),
    enabled: pnr.length > 0,
  });

  if (everything.isLoading) {
    return <div className="p-8 text-gray-500">Laddar patient…</div>;
  }
  if (everything.isError) {
    return <div className="p-8 text-core-red">Kunde inte hämta patient: {String(everything.error)}</div>;
  }

  const bundle = everything.data;
  const patient = entriesByType<FhirPatient>(bundle, 'Patient')[0];
  const meds = entriesByType<FhirMedicationStatement>(bundle, 'MedicationStatement');
  const procedures = entriesByType<FhirProcedure>(bundle, 'Procedure');
  const conditions = entriesByType<FhirCondition>(bundle, 'Condition');
  const observations = entriesByType<FhirObservation>(bundle, 'Observation');
  const allergies = entriesByType<FhirAllergyIntolerance>(bundle, 'AllergyIntolerance');
  const all = bundle?.entry?.map((e) => e.resource) ?? [];

  const name = patient?.name?.[0];
  const fullName = name?.text ?? [name?.given?.[0], name?.family].filter(Boolean).join(' ');
  const age = ageFromBirthDate(patient?.birthDate);
  const genderDisplay = patient?.gender === 'female' ? 'Kvinna' : patient?.gender === 'male' ? 'Man' : patient?.gender ?? '';

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-4">
        <Link to="/search" className="text-sm text-core-teal hover:underline">&larr; Tillbaka till sök</Link>
        <Link to={`/patient/${encodeURIComponent(pnr)}/cds`} className="text-sm text-core-teal hover:underline">
          Öppna CDS-varningar ({cds.data?.cards.length ?? 0})
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vänsterkolumn */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-md bg-core-navy text-white p-4">
            <div className="text-xs uppercase tracking-wide text-gray-300">Patient</div>
            <div className="text-2xl font-semibold mt-1">{fullName || '—'}</div>
            <div className="text-sm text-gray-300 mt-1">
              {patient?.identifier?.[0]?.value ?? pnr}
              {age != null && ` · ${age} år`}
              {genderDisplay && ` · ${genderDisplay}`}
            </div>
            {patient?.address?.[0] && (
              <div className="text-xs text-gray-400 mt-2">
                {patient.address[0].line?.join(', ')} {patient.address[0].postalCode} {patient.address[0].city}
              </div>
            )}
            {patient?.meta?.source && (
              <div className="text-xs text-gray-400 mt-2">Källa: {patient.meta.source}</div>
            )}

            {/* Datakälla- och edge-indikator (Del 15) */}
            <DataSourceIndicator meta={patient?.meta?.source} allResources={all as ResourceLike[]} />
          </div>

          {allergies.length > 0 && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4">
              <div className="text-xs font-semibold text-core-red mb-2 uppercase tracking-wide">⚠ Allergier</div>
              <ul className="space-y-1 text-sm">
                {allergies.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">{a.code?.text ?? a.code?.coding?.[0]?.display ?? '—'}</span>
                    {a.reaction?.[0]?.manifestation?.[0]?.text && (
                      <span className="text-gray-600"> — {a.reaction[0].manifestation[0].text}</span>
                    )}
                    {a.reaction?.[0]?.severity && (
                      <span className="ml-2 text-xs text-gray-500 uppercase">{a.reaction[0].severity}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">CDS-varningar</h2>
            {cds.isLoading && <p className="text-sm text-gray-500">Hämtar varningar…</p>}
            {cds.data?.cards.length === 0 && <p className="text-sm text-gray-500">Inga varningar.</p>}
            <div className="space-y-2">
              {cds.data?.cards.map((c) => <CdsCardView key={c.uuid} card={c} />)}
            </div>
          </div>
        </div>

        {/* Högerkolumn */}
        <div className="lg:col-span-2">
          <div className="flex gap-2 border-b mb-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'border-core-teal text-core-teal'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            {tab === 'timeline' && <TimelineView resources={all} />}
            {tab === 'medications' && <MedicationList items={meds} />}
            {tab === 'labs' && <LabResults items={observations} />}
            {tab === 'conditions' && (
              <ul className="space-y-2">
                {conditions.length === 0 && <li className="text-sm text-gray-500">Inga diagnoser.</li>}
                {conditions.map((c) => (
                  <li key={c.id} className="rounded-md border bg-white p-3 text-sm">
                    <div className="font-medium">{c.code?.text ?? c.code?.coding?.[0]?.display ?? '—'}</div>
                    <div className="text-xs text-gray-500">
                      <span className="font-mono">{c.code?.coding?.[0]?.code}</span>
                      {c.onsetDateTime && ` · ${new Date(c.onsetDateTime).toLocaleDateString('sv-SE')}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {tab === 'procedures' && <ProcedureHistory items={procedures} />}
            {tab === 'vitals' && <VitalSigns items={observations} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------
// DataSourceIndicator — visar källsystemen för patientens data samt
// om svaret kom från central hub eller edge-nodens lokala cache.
// Datakällor härleds från alla resursers meta.source-fält. Edge-status
// bestäms via /api/topology (replication-tjänsten) — om någon edge-nod
// rapporterar 'offline'/'replaying' flaggas det som "offline-läge".
// --------------------------------------------------------------
interface ResourceLike {
  meta?: { source?: string };
}

function DataSourceIndicator({
  meta,
  allResources,
}: {
  meta: string | undefined;
  allResources: ResourceLike[];
}) {
  const sources = new Set<string>();
  if (meta) sources.add(meta);
  for (const r of allResources) {
    if (r?.meta?.source) sources.add(r.meta.source);
  }

  const topology = useQuery<{
    edges: Array<{ instance_id: string; status: string; metrics: { central_hub_connected: boolean } }>;
  }>({
    queryKey: ['topology-indicator'],
    queryFn: async () => {
      const r = await fetch('/api/topology');
      if (!r.ok) throw new Error(`topology: ${r.status}`);
      return r.json();
    },
    refetchInterval: 15_000,
    retry: false,
  });

  const servedByEdge = Array.from(sources).some((s) => s.startsWith('edge-'));
  const anyEdgeOffline = topology.data?.edges?.some(
    (e) => e.status === 'offline' || !e.metrics.central_hub_connected,
  );

  return (
    <div className="mt-3 pt-3 border-t border-core-navy-2 space-y-2">
      {sources.size > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">Datakällor</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {Array.from(sources).map((s) => (
              <span
                key={s}
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  s.startsWith('melior')
                    ? 'bg-core-teal/20 text-core-teal'
                    : s.startsWith('asynja')
                      ? 'bg-blue-500/20 text-blue-200'
                      : s.startsWith('edge-')
                        ? 'bg-core-green/20 text-core-green'
                        : 'bg-gray-500/20 text-gray-300'
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
        <span>Serverad från:</span>
        <span className="text-gray-200">
          {servedByEdge ? 'Edge-nod (lokal cache)' : 'Central hub'}
        </span>
        {anyEdgeOffline && (
          <span className="px-2 py-0.5 rounded-full bg-core-amber/20 text-core-amber text-[10px]">
            Offline-läge aktivt på någon edge
          </span>
        )}
      </div>
    </div>
  );
}
