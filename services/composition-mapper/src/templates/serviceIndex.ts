// HTML-template för service-index på GET / (B25.2.5).
// Renderas när browser-klient skickar Accept: text/html. JSON-väg
// (Accept: application/json eller */* default) hanteras i server.ts.
//
// Single self-contained HTML: inline CSS, ingen extern asset, prefers-
// color-scheme för dark mode. Alla data-fält escapas mot HTML-injection.

export interface ServiceIndexData {
  service: string;
  description: string;
  version: string;
  dataMode: string;
  endpoints: Record<string, string>;
}

/**
 * Human-readable beskrivning per endpoint-key. Visas i HTML:s tabell-
 * kolumn "Purpose". Saknad key → tom cell.
 */
export const ENDPOINT_PURPOSES: Record<string, string> = {
  health: 'Liveness check',
  mapMedicationStatement: 'FHIR R4 → openEHR mapping',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEndpointRows(endpoints: Record<string, string>): string {
  return Object.entries(endpoints)
    .map(([key, value]) => {
      const purpose = ENDPOINT_PURPOSES[key] ?? '';
      const match = value.match(/^(\S+)\s+(.+)$/);
      const method = match ? (match[1] ?? '') : '';
      const path = match ? (match[2] ?? value) : value;
      return `<tr><td><code>${escapeHtml(method)}</code></td><td><code>${escapeHtml(path)}</code></td><td>${escapeHtml(purpose)}</td></tr>`;
    })
    .join('\n        ');
}

const INDEX_CSS = `
:root {
  --bg: #ffffff; --text: #1a1a1a; --text-2: #5a5a5a; --text-3: #888;
  --border: rgba(0,0,0,0.1); --code-bg: #f4f4f4;
  --ok-bg: #e8f5e9; --ok-fg: #2e7d32;
  --info-bg: #e3f2fd; --info-fg: #1565c0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a; --text: #e8e8e8; --text-2: #a0a0a0; --text-3: #707070;
    --border: rgba(255,255,255,0.1); --code-bg: #2a2a2a;
    --ok-bg: #1b3a20; --ok-fg: #81c784;
    --info-bg: #1a3a4d; --info-fg: #64b5f6;
  }
}
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 3rem 1.5rem; }
main { max-width: 720px; margin: 0 auto; }
h1 { font-size: 22px; font-weight: 500; margin: 0 0 0.25rem; }
h1 .v { color: var(--text-2); font-size: 14px; font-weight: 400; margin-left: 8px; }
.desc { color: var(--text-2); margin: 0 0 1.5rem; font-size: 14px; line-height: 1.6; }
.pills { display: flex; gap: 8px; margin-bottom: 2rem; flex-wrap: wrap; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; font-size: 12px; border-radius: 6px; }
.ok { background: var(--ok-bg); color: var(--ok-fg); }
.mode { background: var(--info-bg); color: var(--info-fg); font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; }
h2 { font-size: 16px; font-weight: 500; margin: 2rem 0 0.75rem; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 8px 12px; background: var(--code-bg); color: var(--text-2); font-weight: 500; font-size: 12px; }
td { padding: 10px 12px; border-bottom: 0.5px solid var(--border); }
code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px; padding: 2px 6px; background: var(--code-bg); border-radius: 4px; }
.ftr { margin-top: 2.5rem; color: var(--text-3); font-size: 12px; }
`.trim();

export function renderHtmlIndex(data: ServiceIndexData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.service)}</title>
  <style>${INDEX_CSS}</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(data.service)}<span class="v">v${escapeHtml(data.version)}</span></h1>
    <p class="desc">${escapeHtml(data.description)}</p>
    <div class="pills">
      <span class="pill ok"><span class="dot" aria-hidden="true"></span>Running</span>
      <span class="pill mode">dataMode: ${escapeHtml(data.dataMode)}</span>
    </div>
    <h2>Endpoints</h2>
    <table>
      <thead><tr><th style="width: 80px;">Method</th><th style="width: 320px;">Path</th><th>Purpose</th></tr></thead>
      <tbody>
        ${renderEndpointRows(data.endpoints)}
      </tbody>
    </table>
    <p class="ftr">Part of Nimloth — modular healthcare data platform.</p>
  </main>
</body>
</html>`;
}
