// Topologi-vy: stylized SVG-karta över central hub + edge-noder.
// Hämtar data från replication-tjänstens /topology-endpoint som konsumerar
// core.system.edge.heartbeat-topic och håller senaste heartbeat per edge.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface EdgeNode {
  instance_id: string;
  instance_name: string;
  hospital_name: string;
  hsa_id: string;
  timestamp: string;
  last_seen: string;
  stale: boolean;
  status: 'online' | 'offline' | 'replaying';
  metrics: {
    cdc_events_processed: number;
    fhir_cache_patients: number;
    fhir_cache_size_mb: number;
    buffered_events: number;
    replication_lag_ms: number;
    uptime_seconds: number;
    central_hub_connected: boolean;
  };
}

interface Topology {
  central: { name: string; status: string };
  edges: EdgeNode[];
  generated_at: string;
}

// Statiska positioner för edge-noder i SVG-koordinatsystemet (860×560).
// Fördelat i en cirkel runt central i mitten.
const EDGE_POSITIONS: Record<string, { x: number; y: number }> = {
  su: { x: 260, y: 260 },
  skas: { x: 600, y: 160 },
  nu: { x: 240, y: 120 },
  saes: { x: 630, y: 380 },
  kungalv: { x: 180, y: 420 },
  alingsas: { x: 600, y: 500 },
};

const CENTRAL = { x: 430, y: 280 };

export default function Topology() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<Topology>({
    queryKey: ['topology'],
    queryFn: async () => {
      const r = await fetch('/api/topology');
      if (!r.ok) throw new Error(`topology: ${r.status}`);
      return (await r.json()) as Topology;
    },
    refetchInterval: 10_000,
  });

  const selectedEdge = data?.edges.find((e) => e.instance_id === selected);

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-bold mb-1">Topologi</h1>
      <p className="text-sm text-gray-600 mb-6">
        Edge-noder per sjukhus + central hub. Uppdateras var 10:e sekund från
        <code className="mx-1 px-1 bg-gray-100 rounded text-xs">core.system.edge.heartbeat</code>.
      </p>

      {isLoading && <div className="text-gray-500">Laddar topologi…</div>}
      {error && (
        <div className="rounded-md bg-core-red/10 text-core-red p-4 text-sm border border-core-red/30">
          Kunde inte ladda topologi: {(error as Error).message}. Är replication-tjänsten uppe på port 3007?
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="bg-white rounded-md border p-4">
            <svg viewBox="0 0 860 560" className="w-full h-auto" role="img" aria-label="Topologi-karta">
              {/* Titel i SVG:n */}
              <text x="20" y="30" className="fill-gray-700 text-sm font-semibold" style={{ fontSize: 14 }}>
                Västra Götalandsregionen — Nimloth Core
              </text>

              {/* Linjer från central → edges */}
              {data.edges.map((edge) => {
                const pos = EDGE_POSITIONS[edge.instance_id] ?? { x: 100, y: 100 };
                const color = statusStroke(edge.status);
                return (
                  <g key={`line-${edge.instance_id}`}>
                    <line
                      x1={CENTRAL.x}
                      y1={CENTRAL.y}
                      x2={pos.x}
                      y2={pos.y}
                      stroke={color}
                      strokeWidth={edge.status === 'online' ? 2 : 1.5}
                      strokeDasharray={edge.status === 'online' ? '4 8' : '2 4'}
                      opacity={edge.status === 'offline' ? 0.35 : 0.85}
                    >
                      {edge.status === 'online' && (
                        <animate attributeName="stroke-dashoffset" from="0" to="24" dur="1.6s" repeatCount="indefinite" />
                      )}
                    </line>
                  </g>
                );
              })}

              {/* Central hub */}
              <g>
                <circle cx={CENTRAL.x} cy={CENTRAL.y} r="42" fill="#0D7377" />
                <circle cx={CENTRAL.x} cy={CENTRAL.y} r="48" fill="none" stroke="#0D7377" strokeOpacity="0.2" strokeWidth="8" />
                <text x={CENTRAL.x} y={CENTRAL.y + 4} textAnchor="middle" fill="white" style={{ fontSize: 13, fontWeight: 600 }}>
                  Central
                </text>
                <text x={CENTRAL.x} y={CENTRAL.y + 20} textAnchor="middle" fill="white" style={{ fontSize: 10 }} opacity="0.8">
                  hub
                </text>
              </g>

              {/* Edge-noder */}
              {data.edges.map((edge) => {
                const pos = EDGE_POSITIONS[edge.instance_id] ?? { x: 100, y: 100 };
                const fill = statusFill(edge.status);
                const isSelected = selected === edge.instance_id;
                return (
                  <g
                    key={edge.instance_id}
                    onClick={() => setSelected(edge.instance_id)}
                    className="cursor-pointer"
                  >
                    {edge.status === 'offline' && (
                      <circle cx={pos.x} cy={pos.y} r="32" fill="none" stroke={fill} strokeWidth="2" opacity="0.7">
                        <animate attributeName="r" from="26" to="38" dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.7" to="0" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isSelected ? 28 : 24}
                      fill={fill}
                      stroke={isSelected ? '#0D7377' : 'white'}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <text x={pos.x} y={pos.y + 4} textAnchor="middle" fill="white" style={{ fontSize: 11, fontWeight: 600 }}>
                      {edge.instance_id.toUpperCase()}
                    </text>
                    <text x={pos.x} y={pos.y + 46} textAnchor="middle" fill="#4a5568" style={{ fontSize: 11 }}>
                      {edge.instance_name}
                    </text>
                  </g>
                );
              })}

              {/* Om inga edges — hint */}
              {data.edges.length === 0 && (
                <text x="430" y="500" textAnchor="middle" fill="#8b95a5" style={{ fontSize: 13 }}>
                  Inga heartbeats från edge-noder än. Kör <tspan fill="#0D7377">./scripts/start-distributed.sh</tspan>.
                </text>
              )}
            </svg>
            <div className="mt-4 flex gap-4 text-xs text-gray-600 flex-wrap">
              <Legend color="#27AE60" label="Online" />
              <Legend color="#F39C12" label="Replaying (synkar buffer)" />
              <Legend color="#C0392B" label="Offline" />
              <span className="text-gray-400 ml-auto">
                Senast uppdaterad: {new Date(data.generated_at).toLocaleTimeString('sv-SE')}
              </span>
            </div>
          </div>

          {/* Sidopanel */}
          <aside className="bg-white rounded-md border p-4">
            {!selectedEdge && (
              <div className="text-sm text-gray-500">
                Klicka på en edge-nod för detaljer.
              </div>
            )}
            {selectedEdge && <EdgeDetails edge={selectedEdge} />}
          </aside>
        </div>
      )}
    </div>
  );
}

function EdgeDetails({ edge }: { edge: EdgeNode }) {
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: statusFill(edge.status) }}
        />
        <div className="font-semibold">{edge.instance_name}</div>
      </div>
      <div className="text-xs text-gray-500 mb-1">Sjukhus</div>
      <div className="mb-3">{edge.hospital_name}</div>

      <div className="text-xs text-gray-500 mb-1">HSA-ID</div>
      <div className="mb-3 font-mono text-xs">{edge.hsa_id}</div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Metric label="Status" value={edge.status} />
        <Metric label="Hub connected" value={edge.metrics.central_hub_connected ? 'ja' : 'nej'} />
        <Metric label="FHIR-cache patienter" value={edge.metrics.fhir_cache_patients} />
        <Metric label="Cache-storlek" value={`${edge.metrics.fhir_cache_size_mb} MB`} />
        <Metric label="CDC events processade" value={edge.metrics.cdc_events_processed} />
        <Metric label="Buffrade events" value={edge.metrics.buffered_events} />
        <Metric label="Replication lag" value={`${edge.metrics.replication_lag_ms} ms`} />
        <Metric label="Uptime" value={formatUptime(edge.metrics.uptime_seconds)} />
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Senaste heartbeat: {new Date(edge.last_seen).toLocaleTimeString('sv-SE')}
        {edge.stale && <span className="ml-1 text-core-red">(stale)</span>}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}

function statusFill(status: EdgeNode['status']): string {
  if (status === 'online') return '#27AE60';
  if (status === 'replaying') return '#F39C12';
  return '#C0392B';
}
function statusStroke(status: EdgeNode['status']): string {
  return statusFill(status);
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}
