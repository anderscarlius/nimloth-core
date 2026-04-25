import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCdsCards, getCdsDiscovery } from '../lib/fhir-client';
import CdsCardView from '../components/CdsCard';

export default function CdsAlerts() {
  const { pnr = '' } = useParams();
  const cards = useQuery({ queryKey: ['cds', pnr], queryFn: () => getCdsCards(pnr) });
  const discovery = useQuery({ queryKey: ['cds-discovery'], queryFn: () => getCdsDiscovery() });

  return (
    <div className="p-6 max-w-4xl">
      <Link to={`/patient/${encodeURIComponent(pnr)}`} className="text-sm text-core-teal hover:underline">
        &larr; Tillbaka till patientvy
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-4">CDS-varningar för {pnr}</h1>

      {cards.isLoading && <p>Hämtar…</p>}
      {cards.data?.cards.length === 0 && <p className="text-gray-500">Inga varningar.</p>}
      <div className="space-y-3 mb-8">
        {cards.data?.cards.map((c) => <CdsCardView key={c.uuid} card={c} />)}
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-2">Registrerade CDS-tjänster</h2>
      {discovery.data && (
        <ul className="space-y-2">
          {discovery.data.services.map((s) => (
            <li key={s.id} className="rounded border bg-white p-3 text-sm">
              <div className="font-mono text-core-teal">{s.id}</div>
              <div className="font-medium">{s.title}</div>
              <div className="text-gray-600">{s.description}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
