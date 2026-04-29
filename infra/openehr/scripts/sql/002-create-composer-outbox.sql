-- Symbol-länk-aktig kopia av services/openehr-composer/migrations/002-create-composer-outbox.sql
-- Källan-of-truth ligger i tjänsten (där composer-startup kör migrations).
-- Denna kopia finns för dokumentations-synlighet av openEHR-spårets schema-yta.

CREATE TABLE IF NOT EXISTS composer_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_id        UUID NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,
  patient_pnr     TEXT NOT NULL,
  payload         JSONB NOT NULL,
  source          TEXT NOT NULL,
  kafka_topic     TEXT,
  kafka_partition INT,
  kafka_offset    BIGINT,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  last_error      TEXT,
  composition_uid TEXT,
  ehr_id          UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  CONSTRAINT composer_outbox_valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  CONSTRAINT composer_outbox_valid_source CHECK (source IN ('kafka', 'http'))
);

CREATE INDEX IF NOT EXISTS idx_composer_outbox_status_created
  ON composer_outbox(status, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_composer_outbox_kafka
  ON composer_outbox(kafka_topic, kafka_partition, kafka_offset)
  WHERE kafka_topic IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_composer_outbox_event_id ON composer_outbox(event_id);
