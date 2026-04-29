// EhrbaseAqlClient — tunn HTTP-wrapper kring EHRbases AQL REST-endpoint.
//
// Designprinciper:
//   - POST genomgående (queries blir för långa för URL)
//   - Returnerar typad AqlResult enligt EHRbases response-format
//   - Kastar EhrbaseAqlError med kontext (HTTP-status, rå AQL, response) vid fel
//   - Time-out via AbortController (default 5 sek per query)

export interface AqlResult {
  meta: {
    _executed_aql: string;
    _schema_version: string;
    _created: string;
    resultsize: number;
  };
  q: string;
  columns: Array<{ name?: string; path: string }>;
  rows: unknown[][];
}

export class EhrbaseAqlError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly aql: string,
    public readonly ehrbaseResponse: string,
  ) {
    super(message);
    this.name = 'EhrbaseAqlError';
  }
}

export class EhrbaseAqlClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = 5_000,
  ) {}

  async execute(aql: string, parameters: Record<string, unknown> = {}): Promise<AqlResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/ehrbase/rest/openehr/v1/query/aql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ q: aql, query_parameters: parameters }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new EhrbaseAqlError(
          `EHRbase AQL ${res.status}: ${body.slice(0, 300)}`,
          res.status,
          aql,
          body,
        );
      }
      return (await res.json()) as AqlResult;
    } finally {
      clearTimeout(timer);
    }
  }
}
