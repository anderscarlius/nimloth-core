-- openEHR-composer outbox (Sprint 2 P3.2).
-- Persistent kö som garanterar exactly-once-effekt mot EHRbase oavsett
-- om events kommer via Kafka eller HTTP.
--
-- Mönster:
--   1. Consumer/HTTP-route skriver event till outbox (idempotent på event_id)
--   2. Consumer commitar Kafka-offset EFTER outbox-skrivningen lyckats
--   3. Outbox-processor plockar pending-rader (FOR UPDATE SKIP LOCKED) och
--      dispatchar till EHRbase
--   4. Status uppdateras: pending → processing → completed/failed/skipped
--   5. Vid composer-crash: hängande "processing"-rader återställs till pending
--      vid nästa startup (recoverFromCrash)

CREATE TABLE IF NOT EXISTS composer_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_id        UUID NOT NULL UNIQUE,                -- idempotency-nyckel
  event_type      TEXT NOT NULL,
  patient_pnr     TEXT NOT NULL,
  payload         JSONB NOT NULL,                      -- hela ClinicalEvent
  source          TEXT NOT NULL,                       -- 'kafka' | 'http'
  kafka_topic     TEXT,
  kafka_partition INT,
  kafka_offset    BIGINT,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  composition_uid TEXT,                                -- EHRbase composition UID när processed
  ehr_id          UUID,                                -- vilken EHR den hamnade i
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,

  CONSTRAINT composer_outbox_valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  CONSTRAINT composer_outbox_valid_source CHECK (source IN ('kafka', 'http'))
);

-- Polling-index: snabb lookup av pending-rader sorterade på create-time.
-- Partial index så det bara innehåller rader som processor faktiskt söker.
CREATE INDEX IF NOT EXISTS idx_composer_outbox_status_created
  ON composer_outbox(status, created_at)
  WHERE status IN ('pending', 'processing');

-- Kafka-koordinater för debugging + offset-replay om något går fel.
CREATE INDEX IF NOT EXISTS idx_composer_outbox_kafka
  ON composer_outbox(kafka_topic, kafka_partition, kafka_offset)
  WHERE kafka_topic IS NOT NULL;

-- Idempotency-lookup (UNIQUE-constraint genererar redan ett index men explicit
-- för tydlighet och eventuella prefix-queries).
CREATE INDEX IF NOT EXISTS idx_composer_outbox_event_id ON composer_outbox(event_id);
