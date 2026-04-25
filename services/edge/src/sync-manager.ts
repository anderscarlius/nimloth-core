// SyncManager — dubbelriktad replikering mellan edge och central.
//
// Strategi (Del 13):
//   INBOUND (hydrering av lokal FHIR-cache):
//     - Kafka-snapshot: subscribe till central core.clinical.* med fromBeginning: true.
//       Varje meddelande → FhirCache.upsertX().
//     - HTTP-fallback: om vi inte hämtat något inom hydration.kafkaSnapshotTimeoutMs,
//       gör vi GET mot central /fhir/r4/Patient?_count=200 och hydrar cachen med
//       patientstubbar (Del 14 ersätter detta med core.shared.patient-index).
//
//   OUTBOUND (lokala events → central):
//     - Subscribe till LOKAL Kafka (edge-kafka-su:29092) på core.clinical.* + audit.
//     - Om online: producera till central med prefix `edge-<instanceId>.`.
//     - Om offline: buffras automatiskt av lokal Kafka (KAFKA_LOG_RETENTION_MS=-1).
//       `bufferedEvents`-räknare ökas.
//     - Vid reconnect: consumer fortsätter från senaste offset, mode växlar till 'replaying'
//       tills alla meddelanden konsumerats.
//
//   Not: I Del 13 har vi ingen lokal CDC-producer. Outbound-consumer läser därför ingen
//   trafik förrän vi lägger till lokalt Debezium (utanför scope för Del 13 men arkitekturen
//   är på plats). För tester kan vi pusha manuellt på lokal Kafka.

import { Kafka, type Consumer, type Producer, type EachMessagePayload } from 'kafkajs';
import type { Logger } from 'pino';
import type { FhirCache } from './fhir-cache.js';
import type { OfflineDetector } from './offline-detector.js';
import type { EdgeConfig } from './config.js';

export type SyncMode = 'realtime' | 'buffering' | 'replaying';

export interface SyncState {
  mode: SyncMode;
  bufferedEvents: number;
  forwardedEvents: number;
  lastSyncTimestamp: Date | null;
  replicationLagMs: number;
  inboundMessages: number;
  hydrationComplete: boolean;
}

const CLINICAL_TOPICS = [
  'core.clinical.observation.vitals',
  'core.clinical.lab.result',
  'core.clinical.medication.prescribed',
  'core.clinical.medication.dispensed',
  'core.clinical.procedure.completed',
  'core.clinical.encounter.started',
  'core.clinical.encounter.ended',
  'core.clinical.note.signed',
  'core.clinical.condition.diagnosed',
  'core.clinical.allergy.reported',
];

// Delade data-topics som replication-tjänsten (Del 14) publicerar centralt.
// Edge-noden konsumerar dessa för att få en färsk patient-index, SPAR-register,
// och terminologi utan att behöva slå HTTP mot central för varje uppslag.
const SHARED_TOPICS = [
  'core.shared.patient-index',
  'core.shared.spar-register',
  'core.shared.terminology',
  'core.shared.cds-rules',
];

const INBOUND_TOPICS = [...CLINICAL_TOPICS, ...SHARED_TOPICS];

const OUTBOUND_TOPICS = [...CLINICAL_TOPICS, 'core.audit.access'];

export interface SyncManagerDeps {
  config: EdgeConfig;
  cache: FhirCache;
  detector: OfflineDetector;
  logger: Logger;
}

export class SyncManager {
  private readonly state: SyncState = {
    mode: 'realtime',
    bufferedEvents: 0,
    forwardedEvents: 0,
    lastSyncTimestamp: null,
    replicationLagMs: 0,
    inboundMessages: 0,
    hydrationComplete: false,
  };

  private centralKafka: Kafka | null = null;
  private localKafka: Kafka | null = null;
  private inboundConsumer: Consumer | null = null;
  private outboundConsumer: Consumer | null = null;
  private centralProducer: Producer | null = null;
  private started = false;

  constructor(private readonly deps: SyncManagerDeps) {}

  getState(): SyncState {
    return { ...this.state };
  }

  /** Exponeras för tester. */
  markBuffered(n: number): void {
    this.state.bufferedEvents += n;
    this.state.mode = 'buffering';
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const { config, logger, detector } = this.deps;

    this.centralKafka = new Kafka({
      clientId: config.centralKafka.clientId,
      brokers: config.centralKafka.brokers,
      retry: { retries: 8, initialRetryTime: 300 },
    });
    this.localKafka = new Kafka({
      clientId: config.localKafka.clientId,
      brokers: config.localKafka.brokers,
      retry: { retries: 8, initialRetryTime: 300 },
    });

    // ----- Bootstrap patient-index via HTTP (körs alltid för att få
    //       patient-namn som inte finns i core.clinical-events). Kafka-
    //       strömmen används sedan för deltas/klinisk data. -----
    await this.runHttpBootstrap();

    // ----- INBOUND: central → local cache (klinisk data + delta-patienter) -----
    await this.startInbound();

    // ----- OUTBOUND: local kafka → central -----
    await this.startOutbound();

    // ----- Lyssna på offline/reconnected -----
    detector.on('offline', () => {
      this.state.mode = 'buffering';
      logger.warn('sync-manager: switching to buffering mode (offline)');
    });
    detector.on('reconnected', () => {
      this.state.mode = 'replaying';
      logger.info({ buffered: this.state.bufferedEvents }, 'sync-manager: replaying buffered events');
      // När all consumer-lag är 0 switchar outbound tillbaka till 'realtime'
      // (vi kan inte veta exakt när det hänt utan att läsa admin-API; så vi
      // tar det pragmatiskt: efter N sekunder utan fler events → realtime).
      setTimeout(() => {
        if (this.state.mode === 'replaying') {
          this.state.mode = 'realtime';
          this.state.bufferedEvents = 0;
          logger.info('sync-manager: replay drained, realtime resumed');
        }
      }, 10_000);
    });
  }

  private async startInbound(): Promise<void> {
    const { config, logger, cache } = this.deps;
    const kafka = this.centralKafka;
    if (!kafka) return;

    this.inboundConsumer = kafka.consumer({
      groupId: `edge-${config.instanceId}-inbound`,
      allowAutoTopicCreation: false,
    });

    try {
      await this.inboundConsumer.connect();
      await this.inboundConsumer.subscribe({ topics: INBOUND_TOPICS, fromBeginning: true });
      await this.inboundConsumer.run({
        eachMessage: async (payload) => this.handleInboundMessage(payload),
      });
      logger.info(
        { clinical: CLINICAL_TOPICS.length, shared: SHARED_TOPICS.length },
        'inbound consumer started (central → local cache)',
      );
    } catch (err) {
      logger.error({ err }, 'inbound consumer failed to start');
    }

  }

  /** Körs vid startup (före Kafka-subscribe) för att hydrera patient-namn
   *  som inte finns i core.clinical-events. Kafka levererar delta + klinisk data. */
  private async runHttpBootstrap(): Promise<void> {
    const { config, logger, cache } = this.deps;
    if (!config.hydration.httpFallbackEnabled) return;
    try {
      const url = `${config.centralHub.fhirBaseUrl.replace(/\/$/, '')}/fhir/r4/Patient?_count=200`;
      logger.info({ url }, 'hydration: bootstrapping patient-index via HTTP');
      const res = await fetch(url, {
        headers: {
          Accept: 'application/fhir+json',
          'X-User-HSA': 'SE-EDGE-HYDRATION',
          'X-User-Role': 'SYSTEM',
          'X-PDL-Care-Relation': 'true',
          'X-PDL-Purpose': 'CARE',
          'X-PDL-Care-Unit': config.hsaId,
        },
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'hydration HTTP bootstrap non-200');
        return;
      }
      const bundle = (await res.json()) as {
        entry?: Array<{ resource?: FhirPatientResource }>;
      };
      let count = 0;
      for (const entry of bundle.entry ?? []) {
        const r = entry.resource;
        if (!r || r.resourceType !== 'Patient') continue;
        const pnr = r.identifier?.[0]?.value ?? r.id;
        if (!pnr) continue;
        const name = r.name?.[0];
        cache.upsertPatient({
          personnummer: pnr,
          fornamn: name?.given?.[0] ?? null,
          efternamn: name?.family ?? null,
          fodelsedatum: r.birthDate ?? null,
          kon: r.gender === 'female' ? 'K' : r.gender === 'male' ? 'M' : null,
        });
        count++;
      }
      if (count > 0) {
        this.state.hydrationComplete = true;
        logger.info({ count }, 'hydration: HTTP bootstrap loaded patients');
      }
    } catch (err) {
      logger.warn({ err }, 'hydration HTTP bootstrap failed — relying on Kafka only');
    }
  }

  private async handleInboundMessage({ topic, message }: EachMessagePayload): Promise<void> {
    try {
      if (!message.value) return;
      const data = JSON.parse(message.value.toString()) as Record<string, unknown>;
      this.state.inboundMessages++;
      this.state.lastSyncTimestamp = new Date();
      const { cache } = this.deps;

      // Heuristisk routing baserat på topic + eventuellt patient-stub.
      if (topic === 'core.shared.patient-index') {
        // Replication-tjänstens patient-index — skriver över patient-stubbar
        // med färsk data (namn, födelsedatum, kön).
        const pnr = typeof data.personnummer === 'string' ? data.personnummer : null;
        if (pnr) {
          cache.upsertPatient({
            personnummer: pnr,
            fornamn: (data.fornamn as string | undefined) ?? null,
            efternamn: (data.efternamn as string | undefined) ?? null,
            fodelsedatum: (data.birth_date as string | undefined) ?? null,
            kon: (data.gender as string | undefined) ?? null,
            source_systems: Array.isArray(data.source_systems)
              ? JSON.stringify(data.source_systems)
              : null,
          });
        }
      } else if (topic === 'core.shared.spar-register') {
        const pnr = typeof data.personnummer === 'string' ? data.personnummer : null;
        const blocked = Array.isArray(data.blocked_for) ? (data.blocked_for as string[]) : [];
        if (pnr) {
          for (const hsa of blocked) cache.upsertBlockedPatient(pnr, hsa);
        }
      } else if (topic === 'core.shared.terminology' || topic === 'core.shared.cds-rules') {
        // Placeholder — tas upp i framtida del (lokalt terminologi-/regellager).
      } else if (topic.includes('observation') || topic.includes('lab.result')) {
        cache.upsertObservation(data);
      } else if (topic.includes('medication')) {
        cache.upsertMedication(data);
      } else if (topic.includes('procedure')) {
        cache.upsertProcedure(data);
      } else if (topic.includes('encounter')) {
        cache.upsertEncounter(data);
      } else if (topic.includes('condition.diagnosed')) {
        cache.upsertCondition(data);
      } else if (topic.includes('allergy.reported')) {
        cache.upsertAllergy(data);
      }

      // Vissa events inkluderar patient-stub — synka patientindexet.
      const patient = data.patient as Record<string, unknown> | undefined;
      const pnr = (typeof patient?.personnummer === 'string' ? patient.personnummer : null)
        ?? (typeof data.patient_id === 'string' ? (data.patient_id as string) : null);
      if (pnr && !this.deps.cache.findPatientByPnr(pnr)) {
        cache.upsertPatient({
          personnummer: pnr,
          fornamn: (patient?.fornamn as string | undefined) ?? null,
          efternamn: (patient?.efternamn as string | undefined) ?? null,
          fodelsedatum: (patient?.fodelsedatum as string | undefined) ?? null,
          kon: (patient?.kon as string | undefined) ?? null,
        });
      }

      if (message.offset) {
        const ts = message.timestamp ? new Date(Number(message.timestamp)).toISOString() : new Date().toISOString();
        cache.setSyncOffset(topic, message.offset, ts);
      }

      if (this.state.inboundMessages === 1) {
        this.state.hydrationComplete = true;
      }
    } catch (err) {
      this.deps.logger.error({ err, topic }, 'failed to process inbound message');
    }
  }

  private async startOutbound(): Promise<void> {
    const { config, logger, detector } = this.deps;
    const localKafka = this.localKafka;
    const centralKafka = this.centralKafka;
    if (!localKafka || !centralKafka) return;

    this.centralProducer = centralKafka.producer({ idempotent: true, allowAutoTopicCreation: true });
    try {
      await this.centralProducer.connect();
    } catch (err) {
      logger.warn({ err }, 'central producer initial connect failed (continuing)');
    }

    this.outboundConsumer = localKafka.consumer({
      groupId: `edge-${config.instanceId}-outbound`,
      allowAutoTopicCreation: true,
    });
    try {
      await this.outboundConsumer.connect();
      await this.outboundConsumer.subscribe({ topics: OUTBOUND_TOPICS, fromBeginning: false });
      await this.outboundConsumer.run({
        eachMessage: async ({ topic, message }) => {
          const online = detector.getStatus().online;
          if (!online) {
            this.state.bufferedEvents++;
            this.state.mode = 'buffering';
            return;
          }
          try {
            const prefixedTopic = `edge-${config.instanceId}.${topic}`;
            await this.centralProducer!.send({
              topic: prefixedTopic,
              messages: [
                {
                  key: message.key,
                  value: message.value,
                  headers: {
                    ...(message.headers ?? {}),
                    'x-edge-instance': config.instanceId,
                    'x-edge-timestamp': String(Date.now()),
                  },
                },
              ],
            });
            this.state.forwardedEvents++;
            const ts = Number(message.timestamp || Date.now());
            this.state.replicationLagMs = Math.max(0, Date.now() - ts);
          } catch (err) {
            // Produktion misslyckas → räknas som buffrad + markera buffering
            this.state.bufferedEvents++;
            this.state.mode = 'buffering';
            logger.warn({ err, topic }, 'outbound produce failed — buffering');
          }
        },
      });
      logger.info('outbound consumer started (local → central)');
    } catch (err) {
      logger.warn({ err }, 'outbound consumer failed to start — will buffer locally');
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    await safely(() => this.inboundConsumer?.disconnect());
    await safely(() => this.outboundConsumer?.disconnect());
    await safely(() => this.centralProducer?.disconnect());
  }
}

async function safely(fn: () => Promise<void> | undefined): Promise<void> {
  try {
    await fn();
  } catch {
    /* ignore */
  }
}

interface FhirPatientResource {
  resourceType: 'Patient';
  id?: string;
  identifier?: Array<{ value?: string }>;
  name?: Array<{ family?: string; given?: string[] }>;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
}
