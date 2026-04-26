import { useQuery } from '@tanstack/react-query';

interface TerminologyStatus {
  status: 'ok' | 'degraded';
  fallback: { version: string; sources: string[]; totalCodes: number };
  upstream: {
    snowstorm: { configured: boolean; reachable: boolean | null };
    hapi: { configured: boolean; reachable: boolean | null };
  };
  cache: { size: number; hits: number; misses: number };
  counters: {
    translateRequests: number;
    lookupRequests: number;
    fallbackHits: number;
    upstreamHits: number;
    notFound: number;
  };
}

export default function SystemStatus() {
  const fhir = useQuery({ queryKey: ['h', 'fhir'], queryFn: async () => fetchProxyHealth('/api/fhir/metadata'), refetchInterval: 10000 });
  const cds = useQuery({ queryKey: ['h', 'cds'], queryFn: async () => fetchProxyHealth('/api/cds/cds-services'), refetchInterval: 10000 });
  const audit = useQuery({ queryKey: ['h', 'audit'], queryFn: async () => fetchProxyHealth('/api/audit/stats'), refetchInterval: 10000 });
  const terminology = useQuery({
    queryKey: ['h', 'terminology'],
    queryFn: async () => fetchTerminologyStatus(),
    refetchInterval: 10000,
  });

  const t = terminology.data;
  const tCardDetail = t
    ? `${t.fallback.totalCodes} koder · ${t.fallback.sources.length} källor`
    : terminology.isError
      ? 'unreachable'
      : 'okänd';

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-1">Systemstatus</h1>
      <p className="text-sm text-gray-600 mb-6">Hälsa på Nimloth Core-tjänsterna (uppdateras var 10:e sekund).</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard title="FHIR Facade" port="3003" healthy={fhir.data?.ok} detail={fhir.data?.hint} />
        <StatusCard title="CDS Hooks" port="3004" healthy={cds.data?.ok} detail={cds.data?.hint} />
        <StatusCard title="Audit" port="3005" healthy={audit.data?.ok} detail={audit.data?.hint} />
        <StatusCard
          title="Terminologi"
          port="3008"
          healthy={t ? t.status === 'ok' : terminology.isError ? false : undefined}
          detail={tCardDetail}
        />
      </div>

      {t && (
        <div className="mt-4 rounded-md bg-white border p-4 text-sm">
          <h2 className="font-semibold mb-2">Terminologi-detaljer</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-gray-700">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Källor i fallback</div>
              <ul className="text-xs space-y-0.5">
                {t.fallback.sources.map((s) => (
                  <li key={s}><code>{s}</code></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Cache</div>
              <div>Storlek: {t.cache.size}</div>
              <div>Hits: {t.cache.hits}</div>
              <div>Misses: {t.cache.misses}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Upstream</div>
              <div>
                Snowstorm:{' '}
                {t.upstream.snowstorm.configured
                  ? t.upstream.snowstorm.reachable
                    ? 'OK'
                    : 'unreachable'
                  : 'ej konfigurerad'}
              </div>
              <div>
                HAPI:{' '}
                {t.upstream.hapi.configured
                  ? t.upstream.hapi.reachable
                    ? 'OK'
                    : 'unreachable'
                  : 'ej konfigurerad'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Aktivera fullt läge med profilen <code>terminology-full</code>.
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-600 border-t pt-2">
            Translate-anrop: {t.counters.translateRequests} · Lookup: {t.counters.lookupRequests} · Fallback-hits:{' '}
            {t.counters.fallbackHits} · Upstream-hits: {t.counters.upstreamHits} · Not found: {t.counters.notFound}
          </div>
        </div>
      )}

      <div className="mt-8 rounded-md bg-white border p-4 text-sm">
        <h2 className="font-semibold mb-2">Topologi</h2>
        <ol className="list-decimal pl-5 space-y-1 text-gray-700">
          <li>Melior/AsynjaVisph → Debezium CDC → <code>vgr.cdc.*</code></li>
          <li>Ingest-tjänst publicerar till <code>vgr.cdc.*.raw</code></li>
          <li>Transform → 7 domain topics under <code>core.clinical.*</code> (mappers använder Terminologi-tjänsten via warm-cache)</li>
          <li>FHIR Facade materialiserar till <code>core-db</code> och exponerar <code>/fhir/r4</code></li>
          <li>CDS Hooks prenumererar på patient-view-anrop från dashboard</li>
          <li>Audit loggar varje FHIR-anrop från <code>core.audit.access</code></li>
          <li>Terminologi (Sprint 1) — fallback-data + valfritt Snowstorm/HAPI bakom <code>terminology-full</code>-profilen</li>
        </ol>
      </div>
    </div>
  );
}

async function fetchProxyHealth(url: string): Promise<{ ok: boolean; hint?: string }> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, hint: `HTTP ${r.status}` };
    return { ok: true, hint: 'OK' };
  } catch (err) {
    return { ok: false, hint: 'unreachable' };
  }
}

async function fetchTerminologyStatus(): Promise<TerminologyStatus> {
  const r = await fetch('/api/terminology/system-status');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as TerminologyStatus;
}

function StatusCard({ title, port, healthy, detail }: { title: string; port: string; healthy?: boolean; detail?: string }) {
  const color = healthy === true ? 'text-core-green' : healthy === false ? 'text-core-red' : 'text-gray-400';
  const dot = healthy === true ? 'bg-core-green' : healthy === false ? 'bg-core-red' : 'bg-gray-300';
  return (
    <div className="rounded-md border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${dot}`} />
        <div className="font-semibold">{title}</div>
      </div>
      <div className="text-xs text-gray-500 mt-1">:{port}</div>
      <div className={`text-sm mt-2 ${color}`}>{detail ?? (healthy ? 'OK' : 'okänd')}</div>
    </div>
  );
}
