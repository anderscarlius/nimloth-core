import type { FhirMedicationStatement } from '../lib/types';
import SourceBadge from './SourceBadge';

function isAntithrombotic(atc: string | undefined): boolean {
  return Boolean(atc?.startsWith('B01A'));
}

export default function MedicationList({ items }: { items: FhirMedicationStatement[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-500">Inga aktiva läkemedel.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">Läkemedel</th>
            <th className="px-3 py-2 text-left">ATC</th>
            <th className="px-3 py-2 text-left">Dos</th>
            <th className="px-3 py-2 text-left">Period</th>
            <th className="px-3 py-2 text-left">Källa</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((m) => {
            const coding = m.medicationCodeableConcept?.coding?.[0];
            const atc = coding?.code;
            const warn = isAntithrombotic(atc);
            return (
              <tr key={m.id} className={warn ? 'bg-red-50' : ''}>
                <td className="px-3 py-2">
                  <div className="font-medium">{m.medicationCodeableConcept?.text ?? coding?.display ?? '—'}</div>
                  {warn && <div className="text-xs text-core-red">⚠ Antitrombotiskt läkemedel</div>}
                </td>
                <td className="px-3 py-2 text-gray-700">{atc ?? '—'}</td>
                <td className="px-3 py-2 text-gray-700">{m.dosage?.[0]?.text ?? '—'}</td>
                <td className="px-3 py-2 text-gray-600">
                  {m.effectivePeriod?.start ?? '—'}
                  {m.effectivePeriod?.end ? ` → ${m.effectivePeriod.end}` : ''}
                </td>
                <td className="px-3 py-2">
                  <SourceBadge source={(m as { meta?: { source?: string } }).meta?.source} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
