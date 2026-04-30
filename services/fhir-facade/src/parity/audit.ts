// emitParityAudit (Sprint 2 P3.4, steg 4.4 / spec 4.1.5 Path Y).
//
// Manual audit-publish för ParityRunner. Eventet använder samma JSON-
// schema som audit-mw producerar (AC19 — schema-paritet) men med
// systemspecifika värden:
//   - actor.hsa_id = 'system:parity-runner'
//   - action = 'PARITY_RUN'
//   - resource_type = 'ParitySnapshot'
//   - pdl_context = undefined (ej kliniker-access)
//
// Publishen blockerar inte runner-flödet — failure i Kafka loggas men
// kastar inte. Recorder har redan persisterat snapshots, så även om
// audit-publish failar har vi inget data-loss.

import { randomUUID } from 'node:crypto';
import type { Producer } from 'kafkajs';
import type { ParityRun } from './types.js';

const TOPIC = 'core.audit.access';

export async function emitParityAudit(producer: Producer, run: ParityRun): Promise<void> {
  const outcome = run.failures.length === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE';

  const event = {
    event_id: randomUUID(),
    timestamp: new Date().toISOString(),
    actor: {
      hsa_id: 'system:parity-runner',
      role: 'system',
    },
    action: 'PARITY_RUN',
    resource_type: 'ParitySnapshot',
    resource_id: run.run_id,
    patient_id: run.patient_pnr ?? '',
    pdl_context: undefined,
    canonical_store: undefined,
    outcome,
    request_id: run.run_id,
    duration_ms: Date.now() - run.taken_at.getTime(),
    /** Sprint 2 P3.4 — diagnostiska metadata för audit-konsument utan
     *  att bryta P3.3-schemat. snapshots-arrayen läggs på toppnivå för
     *  att audit-konsumenter kan filtrera på snapshots.length som
     *  proxy för resource-coverage. */
    snapshots_count: run.snapshots.length,
    failures_count: run.failures.length,
  };

  await producer.send({
    topic: TOPIC,
    messages: [{ key: run.patient_pnr ?? 'aggregate', value: JSON.stringify(event) }],
  });
}
