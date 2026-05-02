// ParityTrend (Sprint 2 P3.4, steg 4.7).
//
// Visualiserar paritetsmätserie från fhir-facade:s
// /facade/parity/history-endpoint (proxas via /api/parity/history).
// Linjegraf med mismatch_count över tid per FHIR-resurstyp + tabell
// med senaste snapshot per typ. Färg-kodning för mismatch-magnitud.
//
// Refresh-knapp triggar POST /api/parity/run för Fru Andersson som
// dag-0-patient (hardcoded — kan utvidgas till patient-väljare i
// framtiden). Trigger='manual' enligt spec-konvention (inte
// 'dashboard' — CHECK-constraint accepterar bara manual/scheduled/test).

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const RESOURCE_TYPES = [
  'Patient',
  'Observation',
  'MedicationStatement',
  'Procedure',
  'Condition',
  'AllergyIntolerance',
] as const;
type ResourceType = (typeof RESOURCE_TYPES)[number];

const RESOURCE_COLORS: Record<ResourceType, string> = {
  Patient: '#0D7377',
  Observation: '#F39C12',
  MedicationStatement: '#C0392B',
  Procedure: '#27AE60',
  Condition: '#8E44AD',
  AllergyIntolerance: '#2980B9',
};

const DEFAULT_PATIENT = '19500315-2384'; // Fru Andersson — dag-0-patient

interface ParitySnapshot {
  taken_at: string;
  run_id: string;
  patient_pnr: string;
  resource_type: ResourceType;
  postgres_count: number;
  openehr_count: number;
  mismatch_count: number;
  only_in_postgres: string[];
  only_in_openehr: string[];
  field_coverage: Record<string, { postgres: number; openehr: number }>;
  trigger: string;
  canonicalisation_version: number;
}

interface HistoryResponse {
  snapshots: ParitySnapshot[];
  limit: number;
}

interface RunResponse {
  run_id: string;
  taken_at: string;
  trigger: string;
  patient_pnr: string;
  snapshots: Omit<ParitySnapshot, 'taken_at' | 'run_id' | 'trigger' | 'canonicalisation_version'>[];
  failures: Array<{ resource_type: string; patient_pnr: string; error: string }>;
}

async function fetchHistory(patient: string, limit = 120): Promise<HistoryResponse> {
  const r = await fetch(`/api/parity/history?patient=${patient}&limit=${limit}`);
  if (!r.ok) throw new Error(`history-fetch ${r.status}`);
  return (await r.json()) as HistoryResponse;
}

async function postRun(patient: string): Promise<RunResponse> {
  const r = await fetch(`/api/parity/run?patient=${patient}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'manual' }),
  });
  if (!r.ok) throw new Error(`run-post ${r.status}`);
  return (await r.json()) as RunResponse;
}

/** Pivota snapshots från (per-rad-resurstyp) till (per-timestamp med alla
 *  6 typer som kolumner). Recharts vill ha det formatet. */
function pivotForChart(snapshots: ParitySnapshot[]): Array<Record<string, number | string>> {
  const byTime = new Map<string, Record<string, number | string>>();
  for (const s of snapshots) {
    const key = s.taken_at;
    const existing = byTime.get(key) ?? { taken_at: key };
    existing[s.resource_type] = s.mismatch_count;
    byTime.set(key, existing);
  }
  return Array.from(byTime.values()).sort((a, b) => String(a.taken_at).localeCompare(String(b.taken_at)));
}

/** Senaste snapshot per resurstyp för tabellen. */
function latestPerType(snapshots: ParitySnapshot[]): ParitySnapshot[] {
  const byType = new Map<ResourceType, ParitySnapshot>();
  for (const s of snapshots) {
    const existing = byType.get(s.resource_type);
    if (!existing || s.taken_at > existing.taken_at) byType.set(s.resource_type, s);
  }
  return Array.from(byType.values()).sort((a, b) => a.resource_type.localeCompare(b.resource_type));
}

function statusColor(mismatch: number): string {
  if (mismatch === 0) return 'text-core-green';
  if (mismatch <= 5) return 'text-core-amber';
  return 'text-core-red';
}

function direction(s: ParitySnapshot): string {
  if (s.postgres_count === s.openehr_count) return 'N/A';
  if (s.postgres_count > s.openehr_count) {
    return `postgres → openehr (saknar ${s.postgres_count - s.openehr_count})`;
  }
  return `openehr → postgres (saknar ${s.openehr_count - s.postgres_count})`;
}

export default function ParityTrend() {
  const [patient] = useState(DEFAULT_PATIENT);
  const qc = useQueryClient();
  const history = useQuery({
    queryKey: ['parity', 'history', patient],
    queryFn: () => fetchHistory(patient),
    refetchInterval: 30000,
  });

  const runMutation = useMutation({
    mutationFn: () => postRun(patient),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parity', 'history', patient] }),
  });

  const snapshots = history.data?.snapshots ?? [];
  const chartData = pivotForChart(snapshots);
  const latest = latestPerType(snapshots);
  const dayZero = snapshots.length > 0 ? [...snapshots].sort((a, b) => a.taken_at.localeCompare(b.taken_at))[0]?.taken_at : null;
  const lastUpdated = snapshots.length > 0 ? [...snapshots].sort((a, b) => b.taken_at.localeCompare(a.taken_at))[0]?.taken_at : null;
  const canonVersion = snapshots[0]?.canonicalisation_version ?? 1;

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex justify-between items-start mb-1">
        <h1 className="text-2xl font-bold">Paritets-trend</h1>
        <button
          type="button"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="px-4 py-2 bg-core-teal text-white rounded text-sm hover:bg-core-teal-dark disabled:opacity-50"
        >
          {runMutation.isPending ? 'Kör mätning…' : 'Trigga ny mätning'}
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-1">
        Postgres-vs-openEHR-paritet för patient <code>{patient}</code>. Mätserie för P3.4.
      </p>
      <p className="text-xs text-gray-500 mb-6">
        {lastUpdated ? `Senast uppdaterad: ${lastUpdated}` : 'Ingen mätserie än'}
        {history.isFetching && ' · uppdaterar…'}
      </p>

      {history.isLoading && <div className="text-sm text-gray-500">Laddar…</div>}
      {history.isError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          Fel vid hämtning: {String(history.error)}
        </div>
      )}
      {runMutation.isError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800 mb-4">
          Mätning failade: {String(runMutation.error)}
        </div>
      )}

      {!history.isLoading && !history.isError && snapshots.length === 0 && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          Ingen mätserie än. Klicka "Trigga ny mätning" för att skapa dag-0-snapshot.
        </div>
      )}

      {snapshots.length > 0 && (
        <>
          <section className="mb-8 bg-white border rounded-md p-4">
            <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-gray-700">
              Senaste mätning per resurstyp
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left py-1.5">Resurstyp</th>
                  <th className="text-right py-1.5">Postgres</th>
                  <th className="text-right py-1.5">OpenEHR</th>
                  <th className="text-right py-1.5">Mismatch</th>
                  <th className="text-left py-1.5 pl-4">Riktning</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((s) => (
                  <tr key={s.resource_type} className="border-t">
                    <td className="py-1.5">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ backgroundColor: RESOURCE_COLORS[s.resource_type] }}
                      />
                      {s.resource_type}
                    </td>
                    <td className="text-right py-1.5 font-mono">{s.postgres_count}</td>
                    <td className="text-right py-1.5 font-mono">{s.openehr_count}</td>
                    <td className={`text-right py-1.5 font-mono font-semibold ${statusColor(s.mismatch_count)}`}>
                      {s.mismatch_count}
                    </td>
                    <td className="py-1.5 pl-4 text-xs text-gray-600">{direction(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mb-8 bg-white border rounded-md p-4">
            <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-gray-700">
              Mismatch-trend över tid
            </h2>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="taken_at"
                  tickFormatter={(v: string) => v.slice(11, 19)}
                  fontSize={11}
                />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip
                  labelFormatter={(v) => `Tagen: ${v}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {RESOURCE_TYPES.map((rt) => (
                  <Line
                    key={rt}
                    type="monotone"
                    dataKey={rt}
                    stroke={RESOURCE_COLORS[rt]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </section>
        </>
      )}

      <footer className="text-xs text-gray-500 border-t pt-3">
        {dayZero && <>Mätserien startas dag-0: <code>{dayZero}</code>. </>}
        Kanonisering version {canonVersion}.{' '}
        Endpoint: <code>/api/parity/history</code>{' '}
        (Path Y, system-internal — utanför PDL-mw).
      </footer>
    </div>
  );
}
