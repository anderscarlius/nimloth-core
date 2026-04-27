// Mock-provider: deterministisk fixture-bank för tester och CI utan API-credit.
// Default-fixturen returnerar en igenkännbar TS-mapper-stub så proposer-flöden
// kan verifieras end-to-end utan riktig modell.
//
// För skarpare tester: skicka fixtures-tabell vid construction.

import type { InvokeRequest, Provider, ProviderDescriptor } from '../types.js';

export interface MockFixture {
  /** Matchar substring av userPrompt eller task-namn. Första träffen vinner. */
  match: string;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

const DEFAULT_FIXTURES: MockFixture[] = [
  {
    match: 'mapping.propose',
    text: `\`\`\`typescript
// Mock-genererad mapper-stub.
import type { CdcRawEvent, MapperContext, MapperResult } from '../../types.js';

export function mapMockTable(raw: CdcRawEvent, ctx: MapperContext): MapperResult | null {
  const data = raw.after;
  if (!data) return null;
  ctx.metrics.recordProcessed('core.clinical.mock.event');
  return {
    topic: 'core.clinical.mock.event',
    event: { event_id: \`mock-\${raw.source_table}-\${Date.now()}\`, source: raw.source_system },
  };
}
\`\`\`
`,
  },
  {
    match: 'mapping.observe',
    text: 'Mock observation: pattern detected in skipped events. Suggest expanding mapper for unhandled order_type.',
  },
  {
    match: 'mapping.ask',
    text: 'Mock answer: cannot route PHI data without on-premise provider configured.',
  },
];

export class MockProvider implements Provider {
  constructor(
    public readonly descriptor: ProviderDescriptor,
    private readonly fixtures: MockFixture[] = DEFAULT_FIXTURES,
  ) {}

  async invoke(
    _model: string,
    req: InvokeRequest,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const haystack = `${req.task}\n${req.userPrompt}`;
    const hit =
      this.fixtures.find((f) => haystack.includes(f.match)) ?? this.fixtures[0];
    return {
      text: hit?.text ?? 'mock empty response',
      inputTokens: hit?.inputTokens ?? Math.max(1, Math.floor(req.userPrompt.length / 4)),
      outputTokens: hit?.outputTokens ?? Math.max(1, Math.floor((hit?.text ?? '').length / 4)),
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
