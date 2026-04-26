import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import pino from 'pino';
import { FallbackStore } from '../fallback.js';
import { UpstreamClient } from '../upstream.js';
import { Translator } from '../translator.js';

const FALLBACK_PATH = path.resolve(__dirname, '../../data/terminology-fallback.json');

describe('FallbackStore', () => {
  let store: FallbackStore;

  beforeAll(async () => {
    store = new FallbackStore();
    await store.load(FALLBACK_PATH);
  });

  it('laddar fallback-data och rapporterar antal koder', () => {
    expect(store.isLoaded()).toBe(true);
    expect(store.totalCodes()).toBeGreaterThan(20);
    expect(store.listSources()).toContain('MELIOR-VITALS');
    expect(store.listSources()).toContain('MELIOR-NPU');
  });

  it('översätter MELIOR-VITALS → SNOMED för blodtryck', () => {
    const r = store.translate({ source: 'MELIOR-VITALS', target: 'SNOMED', code: 'BLOOD_PRESSURE' });
    expect(r).not.toBeNull();
    expect(r!.code).toBe('75367002');
    expect(r!.system).toBe('http://snomed.info/sct');
  });

  it('översätter NPU → LOINC för INR', () => {
    const r = store.translate({ source: 'MELIOR-NPU', target: 'LOINC', code: 'NPU04206' });
    expect(r).not.toBeNull();
    expect(r!.code).toBe('6301-6');
    expect(r!.system).toBe('http://loinc.org');
  });

  it('returnerar null för okänd kod', () => {
    const r = store.translate({ source: 'MELIOR-VITALS', target: 'SNOMED', code: 'NONSENSE' });
    expect(r).toBeNull();
  });

  it('returnerar null när target inte matchar tabellens target', () => {
    // VITALS översätter alltid till SNOMED, så target=LOINC ska missa
    const r = store.translate({ source: 'MELIOR-VITALS', target: 'LOINC', code: 'BLOOD_PRESSURE' });
    expect(r).toBeNull();
  });

  it('lookup fungerar via SNOMED-alias och URI', () => {
    const viaAlias = store.lookup('SNOMED', '75367002');
    expect(viaAlias?.display).toBe('Blood pressure');
    const viaUri = store.lookup('http://snomed.info/sct', '75367002');
    expect(viaUri?.display).toBe('Blood pressure');
  });
});

describe('Translator', () => {
  const logger = pino({ level: 'silent' });

  async function freshTranslator() {
    const fb = new FallbackStore();
    await fb.load(FALLBACK_PATH);
    const up = new UpstreamClient({ snowstormUrl: '', hapiTerminologyUrl: '', timeoutMs: 1000 }, logger);
    return new Translator(fb, up, logger, 100, 60_000);
  }

  it('cachar repeterade translate-anrop', async () => {
    const t = await freshTranslator();
    await t.translate({ source: 'MELIOR-KVA', target: 'SNOMED', code: 'NFB49' });
    await t.translate({ source: 'MELIOR-KVA', target: 'SNOMED', code: 'NFB49' });
    expect(t.counters.translateRequests).toBe(2);
    expect(t.counters.fallbackHits).toBe(1);
    expect(t.counters.cacheHits).toBe(1);
    expect(t.counters.cacheMisses).toBe(1);
  });

  it('räknar notFound när varken fallback eller upstream finns', async () => {
    const t = await freshTranslator();
    const r = await t.translate({ source: 'UNKNOWN', target: 'SNOMED', code: 'XYZ' });
    expect(r).toBeNull();
    expect(t.counters.notFound).toBe(1);
  });

  it('expand returnerar Parameters med informational message i fallback-mode', async () => {
    const t = await freshTranslator();
    const r = await t.expand({ url: 'http://hl7.org/fhir/ValueSet/condition-code' });
    expect(r.resourceType).toBe('Parameters');
    expect(r.parameter.some((p) => p.name === 'message')).toBe(true);
    expect(t.counters.expandRequests).toBe(1);
  });
});

describe('UpstreamClient', () => {
  const logger = pino({ level: 'silent' });

  it('rapporterar !configured när URLs saknas', () => {
    const u = new UpstreamClient({ snowstormUrl: '', hapiTerminologyUrl: '', timeoutMs: 1000 }, logger);
    expect(u.isAnyConfigured()).toBe(false);
    const r = u.reachability();
    expect(r.snowstorm.configured).toBe(false);
    expect(r.hapi.configured).toBe(false);
  });

  it('rapporterar configured när URL är satt (men reachable=null tills check körts)', () => {
    const u = new UpstreamClient(
      { snowstormUrl: 'http://snowstorm:8080/fhir', hapiTerminologyUrl: '', timeoutMs: 1000 },
      logger,
    );
    expect(u.isAnyConfigured()).toBe(true);
    const r = u.reachability();
    expect(r.snowstorm.configured).toBe(true);
    expect(r.snowstorm.reachable).toBeNull();
  });

  it('translate returnerar null när ingen upstream är konfigurerad', async () => {
    const u = new UpstreamClient({ snowstormUrl: '', hapiTerminologyUrl: '', timeoutMs: 1000 }, logger);
    const r = await u.translate({ source: 'MELIOR-VITALS', target: 'SNOMED', code: 'BLOOD_PRESSURE' });
    expect(r).toBeNull();
  });
});
