import type { FhirObservation } from '../lib/types';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function vitalTypeCode(o: FhirObservation): string {
  return o.code.coding?.[0]?.code ?? '';
}

function vitalValue(o: FhirObservation): number | null {
  if (o.valueQuantity?.value != null) return o.valueQuantity.value;
  if (o.component?.[0]?.valueQuantity?.value != null) return o.component[0].valueQuantity.value;
  return null;
}

const TYPE_LABEL: Record<string, string> = {
  '75367002': 'Blodtryck',
  '364075005': 'Puls',
  '386725007': 'Temperatur',
  '431314004': 'SpO₂',
  '86290005': 'Andningsfrekvens',
};

export default function VitalSigns({ items }: { items: FhirObservation[] }) {
  const vitals = items.filter((o) =>
    o.category?.some((c) => c.coding?.some((cc) => cc.code === 'vital-signs')),
  );
  if (vitals.length === 0) return <p className="text-sm text-gray-500">Inga vitala parametrar.</p>;

  const byType = new Map<string, FhirObservation[]>();
  for (const v of vitals) {
    const code = vitalTypeCode(v);
    if (!byType.has(code)) byType.set(code, []);
    byType.get(code)!.push(v);
  }

  return (
    <div className="space-y-4">
      {Array.from(byType.entries()).map(([code, list]) => {
        const label = TYPE_LABEL[code] ?? list[0].code.text ?? code;
        const data = list
          .map((o) => ({
            time: o.effectiveDateTime ?? '',
            value: vitalValue(o),
          }))
          .filter((d) => d.value != null)
          .sort((a, b) => (a.time < b.time ? -1 : 1));
        const latest = data[data.length - 1];
        return (
          <div key={code} className="rounded-md border bg-white p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-semibold">{label}</h3>
              {latest && (
                <div className="text-right">
                  <div className="text-lg font-mono text-core-teal">
                    {latest.value} {list[0].valueQuantity?.unit ?? ''}
                  </div>
                  <div className="text-xs text-gray-500">{new Date(latest.time).toLocaleDateString('sv-SE')}</div>
                </div>
              )}
            </div>
            {data.length >= 2 && (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tickFormatter={(t) => new Date(t).toLocaleDateString('sv-SE')} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#0D7377" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      })}
    </div>
  );
}
