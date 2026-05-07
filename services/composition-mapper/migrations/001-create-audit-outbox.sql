-- composition-mapper SQLite-schema (Sprint 2, P4 4.1).
-- Lokal store för audit-outbox. Behåller tjänsten portabel — kan köras på
-- egen hårdvara utan core-db-tillgång. Schema-förebild: services/mapping-assistant/migrations/001_init.sql.

-- ============================================================
-- Audit outbox: events att publicera till core.audit.access.
-- Tjänsten skriver synkront vid varje MAPPING_RUN + state-ändring.
-- AuditPublisher drainar mot Kafka. Kafka nere = events sparas tills upp.
-- Idempotency via event_id (UUID).
--
-- Skiljer sig från mapping-assistants outbox endast i topic-mål:
-- mapping-assistant → core.audit.mapping
-- composition-mapper → core.audit.access (per P4-spec)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,                    -- mapping_run | mapping_failed | review_required
  payload         TEXT NOT NULL,                    -- JSON-payload (audit-event)
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  publish_attempts INTEGER DEFAULT 0,
  last_attempt_at TEXT,
  published_at    TEXT,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON audit_outbox(published_at) WHERE published_at IS NULL;
