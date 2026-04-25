import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { searchPatient } from '../lib/fhir-client';
import type { FhirPatient } from '../lib/types';

export default function PatientSearch() {
  const [pnr, setPnr] = useState('19500315-2384');
  const nav = useNavigate();

  const { mutate, data, isPending, error } = useMutation({
    mutationFn: (input: string) => searchPatient(input),
  });

  const results: FhirPatient[] = data?.entry?.map((e) => e.resource) ?? [];

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">Patientsök</h1>
      <p className="text-sm text-gray-600 mb-6">
        Sök på personnummer. Nimloth Core svarar med data från Melior + AsynjaVisph via FHIR Facade.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pnr.trim()) mutate(pnr.trim());
        }}
        className="flex gap-2 mb-6"
      >
        <input
          type="text"
          value={pnr}
          onChange={(e) => setPnr(e.target.value)}
          placeholder="Personnummer (yymmdd-xxxx)"
          className="flex-1 rounded-md border border-gray-300 px-4 py-2 focus:border-core-teal focus:outline-none focus:ring-1 focus:ring-core-teal"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-core-teal px-6 py-2 text-white font-medium hover:bg-core-teal-dark disabled:opacity-50"
        >
          {isPending ? 'Söker…' : 'Sök'}
        </button>
      </form>

      <div className="text-xs text-gray-500 mb-3">Exempel: 19500315-2384 (Fru Andersson) · 19420512-1234 (Gunnar Persson)</div>

      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800 mb-4">{String(error)}</div>}

      <div className="space-y-2">
        {results.map((p) => {
          const name = p.name?.[0];
          const fullName = name?.text ?? [name?.given?.[0], name?.family].filter(Boolean).join(' ');
          const source = p.meta?.source;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => nav(`/patient/${encodeURIComponent(p.id)}`)}
              className="w-full text-left rounded-md border bg-white p-4 shadow-sm hover:border-core-teal transition-colors"
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-semibold">{fullName || '—'}</div>
                  <div className="text-sm text-gray-600">
                    {p.identifier?.[0]?.value ?? p.id}
                    {p.birthDate && ` · född ${p.birthDate}`}
                    {p.gender && ` · ${p.gender === 'female' ? 'kvinna' : p.gender === 'male' ? 'man' : p.gender}`}
                  </div>
                </div>
                {source && (
                  <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium">{source}</span>
                )}
              </div>
            </button>
          );
        })}
        {data && results.length === 0 && (
          <p className="text-sm text-gray-500">Inga patienter hittades.</p>
        )}
      </div>
    </div>
  );
}
