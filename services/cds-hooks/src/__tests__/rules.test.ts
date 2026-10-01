// CDS-regler testade med syntetiska FHIR-bundles.

import { describe, expect, it } from 'vitest';
import { anticoagulationCard } from '../rules/anticoagulation.js';
import { implantCards } from '../rules/implant-alert.js';
import { dvtCard } from '../rules/dvt-risk.js';
import { runAllRules } from '../rules/index.js';
import { sortCards } from '../types.js';
import {
  bundle,
  DVT,
  HIP_REPLACEMENT,
  HYPERTENSION,
  METFORMIN,
  syntheticFruAnderssonPrefetch,
  WARAN,
} from '../fixtures/synthetic-fru-andersson.js';

// ============================================================
describe('Fru Andersson-scenariot', () => {
  const prefetch = syntheticFruAnderssonPrefetch();

  it('alla tre regler triggar', () => {
    const cards = runAllRules(prefetch);
    expect(cards).toHaveLength(3);
    const summaries = cards.map((c) => c.summary);
    expect(summaries.some((s) => s.includes('antikoagulerad'))).toBe(true);
    expect(summaries.some((s) => s.includes('implantat'))).toBe(true);
    expect(summaries.some((s) => s.includes('tromboembolism'))).toBe(true);
  });

  it('antikoagulation blir critical', () => {
    const card = anticoagulationCard(prefetch);
    expect(card?.indicator).toBe('critical');
    expect(card?.detail).toContain('Waran');
  });

  it('implantat-card innehåller Zimmer Biomet-modell', () => {
    const cards = implantCards(prefetch);
    expect(cards).toHaveLength(1);
    expect(cards[0].detail).toContain('Zimmer Biomet');
    expect(cards[0].detail).toContain('Avenir Complete');
    expect(cards[0].detail).toContain('Right');
  });

  it('DVT-card triggar på I82.4', () => {
    const card = dvtCard(prefetch);
    expect(card?.indicator).toBe('info');
    expect(card?.detail).toContain('DVT');
  });

  it('sorterar critical först', () => {
    const sorted = sortCards(runAllRules(prefetch));
    expect(sorted[0].indicator).toBe('critical');
    expect(sorted.slice(1).every((c) => c.indicator === 'info')).toBe(true);
  });
});

describe('Frisk patient', () => {
  const prefetch = {
    medications: bundle([METFORMIN]),
    procedures: bundle([]),
    conditions: bundle([HYPERTENSION]),
  };

  it('ger inga cards', () => {
    const cards = runAllRules(prefetch);
    expect(cards).toHaveLength(0);
  });
});

describe('Endast antikoagulation', () => {
  const prefetch = {
    medications: bundle([WARAN]),
    procedures: bundle([]),
    conditions: bundle([]),
  };

  it('ger exakt ett critical card', () => {
    const cards = runAllRules(prefetch);
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
  });
});

describe('Tom prefetch', () => {
  it('ger inga cards', () => {
    expect(runAllRules({})).toHaveLength(0);
  });
});
