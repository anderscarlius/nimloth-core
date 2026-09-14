import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { fetchDeps } from '../api';
import type { DepsResponse } from '../types';

mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

function toMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_');
}

function buildDefinition(deps: DepsResponse): string {
  const lines = ['graph LR'];
  for (const node of deps.nodes) {
    const mid = toMermaidId(node.id);
    const label = node.name.replace(/"/g, "'");
    if (node.kind === 'service') lines.push(`  ${mid}["${label}"]`);
    else if (node.kind === 'package') lines.push(`  ${mid}(("${label}"))`);
    else lines.push(`  ${mid}{{"${label}"}}`);
  }
  for (const edge of deps.edges) {
    lines.push(`  ${toMermaidId(edge.from)} --> ${toMermaidId(edge.to)}`);
  }
  if (deps.nodes.length === 0) lines.push('  empty["Inga workspace-paket hittades"]');
  return lines.join('\n');
}

export default function DepsGraph() {
  const [deps, setDeps] = useState<DepsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>('');
  const [onlyOrphans, setOnlyOrphans] = useState(false);
  const renderCounter = useRef(0);

  useEffect(() => {
    fetchDeps().then(setDeps).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!deps) return;
    const targeted = new Set(deps.edges.map((e) => e.to));
    const referencing = new Set(deps.edges.map((e) => e.from));
    const filtered = onlyOrphans
      ? {
          nodes: deps.nodes.filter((n) => !targeted.has(n.id) && !referencing.has(n.id)),
          edges: [],
        }
      : deps;
    const def = buildDefinition(filtered);
    renderCounter.current += 1;
    const id = `smedjan-deps-${renderCounter.current}`;
    mermaid
      .render(id, def)
      .then(({ svg }) => setSvg(svg))
      .catch((e) => setError(String(e)));
  }, [deps, onlyOrphans]);

  if (error) return <p className="status-error">{error}</p>;
  if (!deps) return <p className="hint">Laddar…</p>;

  return (
    <div className="deps-view">
      <p className="hint">
        Beroendegraf mellan <code>services/*</code> (rektanglar), <code>packages/*</code> (cirklar)
        och <code>tools/*</code> (hexagoner), härledd från varje paket egna <code>package.json</code>{' '}
        (<code>@nimloth-core/*</code>-beroenden). Statisk — endast deklarerade paketberoenden, inte
        faktiska importer i koden.
      </p>
      <label className="checkbox-row">
        <input type="checkbox" checked={onlyOrphans} onChange={(e) => setOnlyOrphans(e.target.checked)} />
        Visa bara isolerade paket (inga beroenden åt något håll — kandidater för dödkodskontroll)
      </label>
      <div className="mermaid-container" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
