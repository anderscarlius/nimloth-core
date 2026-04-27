-- Mapping-assistant SQLite-schema (Sprint 2, P4 Fas 4.1).
-- Lokal store för förslag + outbox för audit-events. Behåller tjänsten
-- portabel — kan köras på egen hårdvara utan core-db-tillgång.

-- ============================================================
-- Suggestions: AI-genererade förslag på nya/ändrade mappers.
-- Lifecycle: pending → approved | rejected.
-- En suggestion persisteras direkt vid /propose; godkännande/avvisning
-- är en senare interaktion via dashboard eller CLI.
-- ============================================================
CREATE TABLE IF NOT EXISTS suggestions (
  id              TEXT PRIMARY KEY,
  task            TEXT NOT NULL,                    -- mapping.propose | mapping.observe | mapping.ask
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  source          TEXT,                              -- t.ex. 'flexlab-db.results'
  target          TEXT,                              -- t.ex. 'core.clinical.lab.result'
  prompt_hash     TEXT NOT NULL,                    -- SHA256 av (system + user)
  template_name   TEXT NOT NULL,
  template_sha    TEXT NOT NULL,                    -- SHA256 av prompt-template-filen
  provider_id     TEXT NOT NULL,
  model_used      TEXT NOT NULL,
  data_residency  TEXT NOT NULL,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  latency_ms      INTEGER,
  generated_text  TEXT NOT NULL,                    -- råa modellutdata
  review_notes    TEXT,                              -- extraherade kommentarer/varningar
  proposed_path   TEXT,                              -- t.ex. 'services/transform/src/mappings/proposed/<n>.ts'
  approver_hsa_id TEXT,                              -- sätts när status != pending
  approver_role   TEXT,
  decision_at     TEXT,
  decision_reason TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sugg_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_sugg_task ON suggestions(task);
CREATE INDEX IF NOT EXISTS idx_sugg_created ON suggestions(created_at);

-- ============================================================
-- Audit outbox: events att publicera till core.audit.mapping.
-- Tjänsten skriver synkront vid varje LLM-anrop + state-ändring.
-- AuditPublisher drainar mot Kafka. Kafka nere = events sparas tills upp.
-- Idempotency via event_id (UUID).
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_outbox (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT NOT NULL UNIQUE,
  event_type      TEXT NOT NULL,                    -- llm_invoked | suggestion_created | suggestion_approved | suggestion_rejected | template_verification_failed
  payload         TEXT NOT NULL,                    -- JSON-payload (RouterAuditEvent + extra fält)
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  publish_attempts INTEGER DEFAULT 0,
  last_attempt_at TEXT,
  published_at    TEXT,
  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON audit_outbox(published_at) WHERE published_at IS NULL;

-- ============================================================
-- Template-verifieringslogg: registreras vid varje startup.
-- Används av status-endpointen + alert-mekanism om manifest mismatch.
-- ============================================================
CREATE TABLE IF NOT EXISTS template_verifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  verified_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  manifest_sha    TEXT NOT NULL,
  total_templates INTEGER NOT NULL,
  passed          INTEGER NOT NULL,
  failed          INTEGER NOT NULL,
  failure_details TEXT
);
