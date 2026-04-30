// emitParityAudit-tester (Sprint 2 P3.4, steg 4.9 / AC14).
//
// Verifierar event-shape, outcome-bestämning, och att eventet publiceras
// på rätt Kafka-topic med rätt key. Schema-paritet med audit-mw verifieras
// separat i parity-audit-schema-parity.test.ts (AC19).

import { describe, expect, it } from 'vitest';
import type { Producer } from 'kafkajs';
import { emitParityAudit } from '../parity/audit.js';
import type { ParityRun, ParitySnapshot, ResourceFailure } from '../parity/types.js';

interface CapturedSend {
  topic: string;
  messages: Array<{ key: string | undefined; value: string }>;
}

function makeFakeProducer(): { producer: Producer; sends: CapturedSend[] } {
  const sends: CapturedSend[] = [];
  const producer = {
    send: async (rec: CapturedSend) => {
      sends.push(rec);
      return [];
    },
  } as unknown as Producer;
  return { producer, sends };
}

function snapshot(resourceType: string, mismatch = 0): ParitySnapshot {
  return {
    resource_type: resourceType as ParitySnapshot['resource_type'],
    patient_pnr: '19500315-2384',
    postgres_count: 0,
    openehr_count: mismatch,
    mismatch_count: mismatch,
    only_in_postgres: [],
    only_in_openehr: [],
    field_coverage: {},
  };
}

function makeRun(opts: {
  patientPnr?: string | null;
  snapshots?: ParitySnapshot[];
  failures?: ResourceFailure[];
} = {}): ParityRun {
  return {
    run_id: '00000000-0000-4000-8000-000000000000',
    taken_at: new Date('2026-04-30T12:00:00Z'),
    trigger: 'manual',
    // 'in' istället för ?? eftersom null är ett legitimt värde här
    patient_pnr: 'patientPnr' in opts ? (opts.patientPnr as string | null) : '19500315-2384',
    snapshots: opts.snapshots ?? [
      snapshot('Patient', 1),
      snapshot('Observation', 3),
      snapshot('MedicationStatement'),
      snapshot('Procedure', 1),
      snapshot('Condition'),
      snapshot('AllergyIntolerance'),
    ],
    failures: opts.failures ?? [],
  };
}

describe('emitParityAudit — event-shape', () => {
  it('publicerar 1 message på core.audit.access', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun());
    expect(sends).toHaveLength(1);
    expect(sends[0].topic).toBe('core.audit.access');
    expect(sends[0].messages).toHaveLength(1);
  });

  it('actor.hsa_id = "system:parity-runner" och role = "system"', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun());
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.actor.hsa_id).toBe('system:parity-runner');
    expect(event.actor.role).toBe('system');
  });

  it('action = "PARITY_RUN" och resource_type = "ParitySnapshot"', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun());
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.action).toBe('PARITY_RUN');
    expect(event.resource_type).toBe('ParitySnapshot');
  });

  it('resource_id = run.run_id', async () => {
    const { producer, sends } = makeFakeProducer();
    const run = makeRun();
    await emitParityAudit(producer, run);
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.resource_id).toBe(run.run_id);
  });

  it('patient_id = run.patient_pnr när satt', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun({ patientPnr: '19500315-2384' }));
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.patient_id).toBe('19500315-2384');
  });

  it('patient_id = "" och Kafka-key = "aggregate" när run.patient_pnr är null', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun({ patientPnr: null }));
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.patient_id).toBe('');
    expect(sends[0].messages[0].key).toBe('aggregate');
  });

  it('snapshots_count och failures_count populerade', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun());
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.snapshots_count).toBe(6);
    expect(event.failures_count).toBe(0);
  });
});

describe('emitParityAudit — outcome', () => {
  it('outcome = "SUCCESS" när failures är tomma', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun({ failures: [] }));
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.outcome).toBe('SUCCESS');
  });

  it('outcome = "PARTIAL_FAILURE" när minst en failure finns', async () => {
    const { producer, sends } = makeFakeProducer();
    const failures: ResourceFailure[] = [
      { resource_type: 'Observation', patient_pnr: '19500315-2384', error: 'EHRbase 503' },
    ];
    await emitParityAudit(producer, makeRun({ failures }));
    const event = JSON.parse(sends[0].messages[0].value);
    expect(event.outcome).toBe('PARTIAL_FAILURE');
  });
});

describe('emitParityAudit — Kafka-key', () => {
  it('Kafka-key = patient_pnr när satt (för per-patient-partitionering)', async () => {
    const { producer, sends } = makeFakeProducer();
    await emitParityAudit(producer, makeRun({ patientPnr: '19500315-2384' }));
    expect(sends[0].messages[0].key).toBe('19500315-2384');
  });
});
