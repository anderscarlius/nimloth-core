-- Observer-tabeller (Sprint 2, P4 Fas 4.2).
-- Aggregerar skip-events per (sourceTable, columnName, reason) över rullande 24h.
-- När count passerar tröskel → skapar suggestion via mapping.observe.

CREATE TABLE IF NOT EXISTS observer_skip_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_system TEXT NOT NULL,                       -- melior, asynja, flexlab, ...
  source_table  TEXT NOT NULL,                       -- patients, results, ...
  column_name   TEXT,                                 -- nullable: hela tabellen okänd
  reason        TEXT NOT NULL,                       -- new_enum_value, new_column, ...
  sample_value  TEXT,                                 -- ev. exempel-värde (avidentifierat)
  occurred_at   TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_obs_lookup ON observer_skip_events(source_table, column_name, reason, occurred_at);
CREATE INDEX IF NOT EXISTS idx_obs_when ON observer_skip_events(occurred_at);

-- Spårar vilka aggregat som redan triggat suggestions så vi inte
-- skapar dubblerade förslag varje aggregat-cykel.
CREATE TABLE IF NOT EXISTS observer_triggers (
  source_table   TEXT NOT NULL,
  column_name    TEXT,
  reason         TEXT NOT NULL,
  triggered_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  suggestion_id  TEXT,
  PRIMARY KEY (source_table, column_name, reason)
);

-- Asker-flödet (4.2 senare): pending-events från transform med confidence=low.
-- Lagrade lokalt så att asker-anrop kan göras asynkront och dashboard kan visa kö.
CREATE TABLE IF NOT EXISTS asker_pending (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT NOT NULL UNIQUE,
  source_system   TEXT NOT NULL,
  source_table    TEXT NOT NULL,
  mapper_name     TEXT NOT NULL,
  raw_event       TEXT NOT NULL,                    -- JSON med raw payload (PHI!)
  confidence      TEXT NOT NULL DEFAULT 'low',
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | answered | escalated | rejected
  decision        TEXT,                              -- apply | reject | escalate (från AI)
  patch           TEXT,                              -- JSON-patch om decision=apply
  rationale       TEXT,
  suggestion_id   TEXT,                              -- länk till suggestions-raden om sådan skapades
  received_at     TEXT DEFAULT CURRENT_TIMESTAMP,
  answered_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_asker_status ON asker_pending(status);
