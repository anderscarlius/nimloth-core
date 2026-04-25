import type { FhirObservation } from '../lib/types';

function flag(o: FhirObservation): string | null {
  const v = o.valueQuantity?.value;
  if (v == null) return null;
  // Nimloth Core har inte refIntervall direkt på Observation — ta bara värdet.
  return null;
}

export default function LabResults({ items }: { items: FhirObservation[] }) {
  const lab = items.filter((o) =>
    o.category?.some((c) => c.coding?.some((cc) => cc.code === 'laboratory')),
  );
  if (lab.length === 0) return <p className="text-sm text-gray-500">Inga labresultat.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">Analys</th>
            <th className="px-3 py-2 text-left">Värde</th>
            <th className="px-3 py-2 text-left">Enhet</th>
            <th className="px-3 py-2 text-left">Tid</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lab.map((o) => (
            <tr key={o.id}>
              <td className="px-3 py-2">
                <div className="font-medium">{o.code.text ?? o.code.coding?.[0]?.display ?? '—'}</div>
                <div className="text-xs text-gray-500">{o.code.coding?.[0]?.code}</div>
              </td>
              <td className="px-3 py-2 font-mono">
                {o.valueQuantity?.value ?? o.valueString ?? '—'}
                {flag(o) && <span className="ml-2 text-core-red font-bold">{flag(o)}</span>}
              </td>
              <td className="px-3 py-2 text-gray-600">{o.valueQuantity?.unit ?? ''}</td>
              <td className="px-3 py-2 text-xs text-gray-500">
                {o.effectiveDateTime ? new Date(o.effectiveDateTime).toLocaleString('sv-SE') : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
