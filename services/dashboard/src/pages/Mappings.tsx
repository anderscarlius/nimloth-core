import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ----------------------------------------------------------------
// Typer som matchar mapping-assistantens response-shape
// ----------------------------------------------------------------
interface Suggestion {
  id: string;
  task: 'mapping.propose' | 'mapping.observe' | 'mapping.ask';
  status: 'pending' | 'approved' | 'rejected';
  source: string | null;
  target: string | null;
  prompt_hash: string;
  template_name: string;
  template_sha: string;
  provider_id: string;
  model_used: string;
  data_residency: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  generated_text: string;
  review_notes: string | null;
  proposed_path: string | null;
  approver_hsa_id: string | null;
  approver_role: string | null;
  decision_at: string | null;
  decision_reason: string | null;
  created_at: string;
}

interface SystemStatusResponse {
  prompts: { manifestSha: string; passed: number; failed: number };
  router: {
    providers: Array<{ id: string; type: string; enabled: boolean; dataResidency: string; models: string[] }>;
    rules: Array<{ task: string; sensitivity: string; require?: string }>;
  };
  audit: { connected: boolean; publishedTotal: number; outbox: { pending: number } };
  observer?: { connected: boolean; consumedTotal: number; suggestionsCreatedTotal: number };
  asker?: { connected: boolean; answeredTotal: number; escalatedTotal: number };
  observerStats?: { skips24h: number; triggers: number; asker: { pending: number; answered: number; escalated: number } };
  suggestions: { pending: number; approved: number; rejected: number };
}

// ----------------------------------------------------------------
// API-klienter
// ----------------------------------------------------------------
async function listSuggestions(status: string): Promise<Suggestion[]> {
  const url = status === 'all' ? '/api/mappings/suggestions' : `/api/mappings/suggestions?status=${status}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = (await r.json()) as { suggestions: Suggestion[] };
  return body.suggestions;
}

async function fetchStatus(): Promise<SystemStatusResponse> {
  const r = await fetch('/api/mappings/system-status');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as SystemStatusResponse;
}

async function decideSuggestion(args: {
  id: string;
  status: 'approve' | 'reject';
  approver_hsa_id: string;
  approver_role: string;
  reason?: string;
}): Promise<Suggestion> {
  const r = await fetch(`/api/mappings/suggestions/${args.id}/${args.status}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approver_hsa_id: args.approver_hsa_id,
      approver_role: args.approver_role,
      reason: args.reason,
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Suggestion;
}

// ----------------------------------------------------------------
// Sida
// ----------------------------------------------------------------
export default function Mappings() {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selected, setSelected] = useState<Suggestion | null>(null);

  const status = useQuery({ queryKey: ['mapping-status'], queryFn: fetchStatus, refetchInterval: 10_000 });
  const list = useQuery({
    queryKey: ['mappings', filter],
    queryFn: () => listSuggestions(filter),
    refetchInterval: 5_000,
  });

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Mappings</h1>
      <p className="text-sm text-gray-600 mb-6">
        AI-genererade mapper-förslag från propose / observe / ask. Inget förslag publiceras till canonical store
        utan mänskligt godkännande.
      </p>

      <StatusBar data={status.data} loading={status.isLoading} error={status.isError} />

      <div className="flex items-center gap-2 mt-6 mb-3 text-sm">
        <span className="text-gray-600">Filter:</span>
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full border ${
              filter === s
                ? 'bg-core-teal text-white border-core-teal'
                : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
            }`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-gray-500">{list.data?.length ?? 0} st</span>
      </div>

      {list.isError && <div className="text-core-red">Kunde inte ladda förslag</div>}
      {list.data && list.data.length === 0 && (
        <div className="rounded-md bg-white border p-6 text-sm text-gray-600 text-center">
          Inga förslag i kategorin <code className="text-xs">{filter}</code>.
        </div>
      )}

      <div className="space-y-2">
        {(list.data ?? []).map((s) => (
          <SuggestionRow key={s.id} suggestion={s} onClick={() => setSelected(s)} />
        ))}
      </div>

      {selected && <DecisionModal suggestion={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ----------------------------------------------------------------
// Status-rad
// ----------------------------------------------------------------
function StatusBar({ data, loading, error }: { data: SystemStatusResponse | undefined; loading: boolean; error: boolean }) {
  if (loading) return <div className="rounded-md bg-white border p-3 text-sm text-gray-500">Laddar status…</div>;
  if (error || !data)
    return <div className="rounded-md bg-white border p-3 text-sm text-core-red">Mapping-assistant: unreachable</div>;

  const promptsBadge = data.prompts.failed === 0 ? `✓ ${data.prompts.passed} prompts` : `⚠ ${data.prompts.failed} fail`;
  return (
    <div className="rounded-md bg-white border p-4 text-sm grid grid-cols-2 md:grid-cols-5 gap-4">
      <Stat label="Pending" value={data.suggestions.pending} accent={data.suggestions.pending > 0 ? 'core-amber' : undefined} />
      <Stat label="Approved" value={data.suggestions.approved} />
      <Stat label="Rejected" value={data.suggestions.rejected} />
      <Stat
        label="Audit"
        value={`${data.audit.publishedTotal} pub / ${data.audit.outbox.pending} kö`}
        accent={data.audit.outbox.pending > 50 ? 'core-amber' : undefined}
      />
      <Stat label="Prompts" value={promptsBadge} accent={data.prompts.failed > 0 ? 'core-red' : undefined} />

      <Stat
        label="Observer"
        value={
          data.observer
            ? `${data.observerStats?.skips24h ?? 0} skips 24h · ${data.observer.suggestionsCreatedTotal} suggestions`
            : 'disabled'
        }
      />
      <Stat
        label="Asker"
        value={
          data.asker
            ? `${data.observerStats?.asker.pending ?? 0} kö · ${data.asker.answeredTotal} svar · ${data.asker.escalatedTotal} esk`
            : 'disabled'
        }
      />
      <Stat
        label="Providers"
        value={
          data.router.providers
            .filter((p) => p.enabled)
            .map((p) => p.id)
            .join(', ') || '(inga aktiva)'
        }
      />
      <Stat label="Manifest" value={data.prompts.manifestSha.slice(0, 12) + '…'} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: 'core-amber' | 'core-red' }) {
  // Statiska klassnamn så Tailwinds JIT plockar upp dem
  const accentClass =
    accent === 'core-amber' ? 'text-core-amber' : accent === 'core-red' ? 'text-core-red' : 'text-gray-900';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-sm font-medium mt-0.5 ${accentClass}`}>{value}</div>
    </div>
  );
}

// ----------------------------------------------------------------
// Suggestion-rad
// ----------------------------------------------------------------
function SuggestionRow({ suggestion, onClick }: { suggestion: Suggestion; onClick: () => void }) {
  const taskColor: Record<Suggestion['task'], string> = {
    'mapping.propose': 'bg-blue-100 text-blue-800',
    'mapping.observe': 'bg-purple-100 text-purple-800',
    'mapping.ask': 'bg-amber-100 text-amber-800',
  };
  const statusColor: Record<Suggestion['status'], string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md bg-white border hover:border-core-teal hover:shadow-sm transition-all p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-flex px-2 py-0.5 rounded ${taskColor[suggestion.task]}`}>{suggestion.task}</span>
            <span className={`inline-flex px-2 py-0.5 rounded ${statusColor[suggestion.status]}`}>{suggestion.status}</span>
            <span className="text-gray-500">via</span>
            <code className="text-gray-700">{suggestion.provider_id}/{suggestion.model_used}</code>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{suggestion.data_residency}</span>
          </div>
          <div className="mt-2 text-sm font-medium truncate">
            <code>{suggestion.source ?? '(ingen källa)'}</code> → <code>{suggestion.target ?? '(inget mål)'}</code>
          </div>
          {suggestion.review_notes && (
            <div className="mt-1 text-xs text-gray-600 truncate">{suggestion.review_notes}</div>
          )}
        </div>
        <div className="text-xs text-gray-400 whitespace-nowrap">{new Date(suggestion.created_at).toLocaleString('sv-SE')}</div>
      </div>
    </button>
  );
}

// ----------------------------------------------------------------
// Beslutsmodal
// ----------------------------------------------------------------
function DecisionModal({ suggestion, onClose }: { suggestion: Suggestion; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [hsaId, setHsaId] = useState('SE2321000131-E000000000999');
  const [role, setRole] = useState('integration-admin');
  const [reason, setReason] = useState('');
  const [editedCode, setEditedCode] = useState(suggestion.generated_text);
  const [error, setError] = useState<string | null>(null);

  const decision = useMutation({
    mutationFn: (status: 'approve' | 'reject') =>
      decideSuggestion({
        id: suggestion.id,
        status,
        approver_hsa_id: hsaId,
        approver_role: role,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mappings'] });
      void queryClient.invalidateQueries({ queryKey: ['mapping-status'] });
      onClose();
    },
    onError: (err: unknown) => setError(String(err)),
  });

  const isPending = suggestion.status === 'pending';

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center p-6 overflow-auto" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{suggestion.task}</h2>
            <div className="text-xs text-gray-600 mt-1">
              <code>{suggestion.source}</code> → <code>{suggestion.target}</code>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Proveniens */}
          <div className="rounded-md bg-gray-50 border text-xs p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
            <div><span className="text-gray-500">Provider:</span> <code>{suggestion.provider_id}</code></div>
            <div><span className="text-gray-500">Modell:</span> <code>{suggestion.model_used}</code></div>
            <div><span className="text-gray-500">Residency:</span> <code>{suggestion.data_residency}</code></div>
            <div><span className="text-gray-500">Tokens:</span> {suggestion.input_tokens ?? '—'} in / {suggestion.output_tokens ?? '—'} ut</div>
            <div><span className="text-gray-500">Latency:</span> {suggestion.latency_ms ?? '—'} ms</div>
            <div className="truncate"><span className="text-gray-500">Template:</span> <code>{suggestion.template_name}</code></div>
            <div className="col-span-full truncate">
              <span className="text-gray-500">Prompt-hash:</span>{' '}
              <code className="text-[10px]">{suggestion.prompt_hash}</code>
            </div>
            <div className="col-span-full truncate">
              <span className="text-gray-500">Template-SHA:</span>{' '}
              <code className="text-[10px]">{suggestion.template_sha}</code>
            </div>
            {suggestion.proposed_path && (
              <div className="col-span-full truncate">
                <span className="text-gray-500">Skriven till:</span>{' '}
                <code className="text-[10px]">{suggestion.proposed_path}</code>
              </div>
            )}
            {suggestion.review_notes && (
              <div className="col-span-full">
                <span className="text-gray-500">Notis:</span> {suggestion.review_notes}
              </div>
            )}
          </div>

          {/* Genererad text — redigerbart fält. För svensk produktion uppgraderas
              detta till CodeMirror i Sprint 5 (riktig syntax + linting). */}
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
              Genererad text {!isPending && '(read-only)'}
            </label>
            <textarea
              value={editedCode}
              onChange={(e) => setEditedCode(e.target.value)}
              readOnly={!isPending}
              rows={20}
              spellCheck={false}
              className="w-full font-mono text-xs border rounded p-3 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-core-teal"
            />
            {isPending && editedCode !== suggestion.generated_text && (
              <div className="text-xs text-amber-700 mt-1">
                Redigeringen visas men sparas inte till proposed/-filen i Fas 4.3 — manuell flytt krävs
                fortfarande för produktionsmerge. (Auto-spara planeras i Sprint 5.)
              </div>
            )}
          </div>

          {/* Beslut */}
          {isPending ? (
            <div className="rounded-md border p-4 space-y-3">
              <div className="text-sm font-semibold">Granska och fatta beslut</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <label>
                  <div className="text-xs text-gray-500 mb-1">Approver HSA-id</div>
                  <input
                    value={hsaId}
                    onChange={(e) => setHsaId(e.target.value)}
                    className="w-full border rounded px-2 py-1 font-mono text-xs"
                  />
                </label>
                <label>
                  <div className="text-xs text-gray-500 mb-1">Roll</div>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </label>
                <label className="md:col-span-2">
                  <div className="text-xs text-gray-500 mb-1">Motivering (valfri)</div>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="t.ex. testat lokalt mot melior fixture"
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </label>
              </div>
              {error && <div className="text-xs text-core-red">{error}</div>}
              <div className="flex gap-2 justify-end pt-2 border-t">
                <button
                  onClick={() => decision.mutate('reject')}
                  disabled={decision.isPending || !hsaId || !role}
                  className="px-4 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Avvisa
                </button>
                <button
                  onClick={() => decision.mutate('approve')}
                  disabled={decision.isPending || !hsaId || !role}
                  className="px-4 py-2 text-sm bg-core-teal text-white rounded hover:bg-core-teal-dark disabled:opacity-50"
                >
                  {decision.isPending ? 'Sparar…' : 'Godkänn'}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-gray-50 border p-3 text-sm">
              <div className="font-semibold">Beslutat</div>
              <div className="text-xs text-gray-600 mt-1">
                {suggestion.status} av <code>{suggestion.approver_hsa_id}</code> ({suggestion.approver_role}) ·{' '}
                {suggestion.decision_at && new Date(suggestion.decision_at).toLocaleString('sv-SE')}
              </div>
              {suggestion.decision_reason && (
                <div className="text-xs text-gray-600 mt-1">Motivering: {suggestion.decision_reason}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
