import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchAudit, getAuditStats } from '../lib/fhir-client';

export default function AuditLog() {
  const [pnr, setPnr] = useState('');
  const stats = useQuery({ queryKey: ['audit-stats'], queryFn: () => getAuditStats() });
  const search = useQuery({
    queryKey: ['audit-search', pnr],
    queryFn: () => searchAudit({ patient: pnr || undefined, limit: 100 }),
  });

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Åtkomstlogg</h1>
      <p className="text-sm text-gray-600 mb-4">
        PDL-kompatibel logg av alla FHIR-anrop. Sök per personnummer; nödöppningar markeras röda.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.data?.by_outcome.map((o) => (
          <div key={o.outcome} className={`rounded-md border p-3 ${o.outcome === 'EMERGENCY_ACCESS' ? 'border-core-red bg-red-50' : 'bg-white'}`}>
            <div className="text-xs text-gray-500 uppercase tracking-wide">{o.outcome}</div>
            <div className="text-2xl font-semibold">{o.count}</div>
          </div>
        ))}
      </div>

      <input
        type="text"
        value={pnr}
        onChange={(e) => setPnr(e.target.value)}
        placeholder="Filtrera på personnummer (eller tomt för senaste 100)"
        className="w-full mb-4 rounded-md border border-gray-300 px-4 py-2"
      />

      {search.isLoading && <p>Hämtar…</p>}
      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Tid</th>
              <th className="px-3 py-2 text-left">Aktör</th>
              <th className="px-3 py-2 text-left">Åtgärd</th>
              <th className="px-3 py-2 text-left">Resurs</th>
              <th className="px-3 py-2 text-left">Patient</th>
              <th className="px-3 py-2 text-left">PDL</th>
              <th className="px-3 py-2 text-left">Utfall</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {search.data?.results.map((r) => {
              const emergency = r.outcome === 'EMERGENCY_ACCESS';
              return (
                <tr key={r.audit_id} className={emergency ? 'bg-red-50' : ''}>
                  <td className="px-3 py-2 text-xs text-gray-600">{new Date(r.timestamp).toLocaleString('sv-SE')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.actor_hsa_id ?? '—'}</td>
                  <td className="px-3 py-2">{r.action}</td>
                  <td className="px-3 py-2">{r.resource_type}{r.resource_id ? ` / ${r.resource_id}` : ''}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.patient_personnummer ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.legal_basis ?? ''} {r.purpose ? `(${r.purpose})` : ''}
                  </td>
                  <td className={`px-3 py-2 text-xs font-medium ${emergency ? 'text-core-red' : ''}`}>{r.outcome ?? '—'}</td>
                </tr>
              );
            })}
            {search.data?.results.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">Inga poster.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
