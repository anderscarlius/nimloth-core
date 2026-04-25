import type { FhirProcedure } from '../lib/types';

interface ImplantDetails {
  type?: string;
  manufacturer?: string;
  model?: string;
  size?: string;
}

function extractImplant(p: FhirProcedure): ImplantDetails | null {
  const ext = p.extension?.find((e) => e.url === 'https://core.nimloth.io/fhir/StructureDefinition/implant-details');
  if (!ext?.extension) return null;
  const d: ImplantDetails = {};
  for (const sub of ext.extension) {
    if (sub.url === 'type') d.type = sub.valueString;
    if (sub.url === 'manufacturer') d.manufacturer = sub.valueString;
    if (sub.url === 'model') d.model = sub.valueString;
    if (sub.url === 'size') d.size = sub.valueString;
  }
  return d;
}

export default function ProcedureHistory({ items }: { items: FhirProcedure[] }) {
  if (items.length === 0) return <p className="text-sm text-gray-500">Inga procedurer.</p>;
  return (
    <div className="space-y-3">
      {items.map((p) => {
        const name = p.code?.text ?? p.code?.coding?.[0]?.display ?? 'Procedur';
        const kva = p.code?.coding?.find((c) => c.system?.includes('kva'))?.code;
        const snomed = p.code?.coding?.find((c) => c.system?.includes('snomed'))?.code;
        const bodySite = p.bodySite?.[0]?.coding?.[0]?.display;
        const performer = p.performer?.[0]?.actor.display;
        const implant = extractImplant(p);
        const when = p.performedDateTime ? new Date(p.performedDateTime).toLocaleDateString('sv-SE') : '—';
        return (
          <div key={p.id} className="rounded-md border bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-semibold">{name}{bodySite ? ` · ${bodySite}` : ''}</div>
                <div className="text-xs text-gray-500">
                  {when}
                  {performer ? ` · ${performer}` : ''}
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                {kva && <div>KVÅ: <span className="font-mono">{kva}</span></div>}
                {snomed && <div>Snomed: <span className="font-mono">{snomed}</span></div>}
              </div>
            </div>
            {implant && (
              <div className="mt-3 rounded bg-amber-50 border border-amber-200 p-3 text-sm">
                <div className="font-semibold text-amber-900 mb-1">🔩 Implantat</div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {implant.type && (<><dt className="text-gray-500">Typ</dt><dd>{implant.type}</dd></>)}
                  {implant.manufacturer && (<><dt className="text-gray-500">Tillverkare</dt><dd>{implant.manufacturer}</dd></>)}
                  {implant.model && (<><dt className="text-gray-500">Modell</dt><dd>{implant.model}</dd></>)}
                  {implant.size && (<><dt className="text-gray-500">Storlek</dt><dd>{implant.size}</dd></>)}
                </dl>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
