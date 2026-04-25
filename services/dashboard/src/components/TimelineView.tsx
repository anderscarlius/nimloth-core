import type {
  FhirEncounter,
  FhirProcedure,
  FhirCondition,
  FhirObservation,
  FhirResource,
} from '../lib/types';

interface TimelineItem {
  when: string;
  icon: string;
  title: string;
  detail?: string;
  type: string;
}

function toTimelineItems(resources: FhirResource[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of resources) {
    if (r.resourceType === 'Encounter') {
      const e = r as FhirEncounter;
      if (e.period?.start) {
        items.push({
          when: e.period.start,
          icon: '🏥',
          title: `Encounter: ${e.serviceProvider?.display ?? e.class?.display ?? 'vårdkontakt'}`,
          detail: `${e.class?.display ?? ''}${e.period.end ? ` (till ${e.period.end.slice(0, 10)})` : ''}`,
          type: 'Encounter',
        });
      }
    } else if (r.resourceType === 'Procedure') {
      const p = r as FhirProcedure;
      if (p.performedDateTime) {
        items.push({
          when: p.performedDateTime,
          icon: '🔧',
          title: `Procedur: ${p.code?.text ?? p.code?.coding?.[0]?.display ?? '—'}`,
          detail: p.performer?.[0]?.actor.display,
          type: 'Procedure',
        });
      }
    } else if (r.resourceType === 'Condition') {
      const c = r as FhirCondition;
      const when = c.onsetDateTime ?? c.recordedDate;
      if (when) {
        items.push({
          when,
          icon: '🩺',
          title: `Diagnos: ${c.code?.text ?? c.code?.coding?.[0]?.display ?? '—'}`,
          detail: c.code?.coding?.[0]?.code,
          type: 'Condition',
        });
      }
    } else if (r.resourceType === 'Observation') {
      const o = r as FhirObservation;
      const isLab = o.category?.some((cat) => cat.coding?.some((cc) => cc.code === 'laboratory'));
      if (isLab && o.effectiveDateTime) {
        items.push({
          when: o.effectiveDateTime,
          icon: '🧪',
          title: `Lab: ${o.code.text ?? o.code.coding?.[0]?.display ?? '—'}`,
          detail: o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit ?? ''}` : '',
          type: 'Lab',
        });
      }
    }
  }
  return items.sort((a, b) => (a.when < b.when ? 1 : -1));
}

export default function TimelineView({ resources }: { resources: FhirResource[] }) {
  const items = toTimelineItems(resources);
  if (items.length === 0) return <p className="text-sm text-gray-500">Ingen tidslinje-data.</p>;

  return (
    <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
      {items.map((it, idx) => (
        <li key={idx} className="ml-4">
          <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-white border-2 border-core-teal text-xs">
            {it.icon}
          </span>
          <time className="text-xs text-gray-500">{new Date(it.when).toLocaleDateString('sv-SE')}</time>
          <div className="font-medium">{it.title}</div>
          {it.detail && <div className="text-sm text-gray-600">{it.detail}</div>}
        </li>
      ))}
    </ol>
  );
}
