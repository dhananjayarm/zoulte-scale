-- Baseline per-station schema (migration v1). Offline-first store for the
-- pharma scale station: readings + audit + transactional outbox + caches.
-- Conventions follow zoulte-pos-ui's per-terminal DB: TEXT ISO timestamps,
-- client-generated UUIDs as PKs, a denormalised sync_status mirror on entity
-- tables for fast UI counts (the outbox remains the source of truth).

CREATE TABLE ws_reading (
  reading_uuid        TEXT PRIMARY KEY,
  product_code        TEXT,                          -- master link (Phase 4); free-text fields kept for pre-master rows
  product_name        TEXT NOT NULL,
  manufacturer_name   TEXT NOT NULL,
  category_code       TEXT,
  batch_no            TEXT NOT NULL,
  manufacturing_date  TEXT NOT NULL,
  expiry_date         TEXT NOT NULL,
  net_weight          REAL NOT NULL,
  unit                TEXT NOT NULL,
  stable_flag         INTEGER,                       -- 1 stable / 0 unstable / NULL device gave no flag
  tolerance_flag      TEXT,                          -- NULL (no nominal on master) | IN_RANGE | OUT_OF_RANGE
  scale_id            TEXT,
  operator            TEXT NOT NULL,
  captured_at_client  TEXT NOT NULL,
  captured_at_server  TEXT,                          -- stamped on sync ack; large drift vs client = flag
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
  void_reason         TEXT,
  voided_by           TEXT,
  voided_at           TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED','REJECTED')),
  verified_by         TEXT,
  verified_at         TEXT,
  sync_status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING','SYNCED')),
  synced_at           TEXT,
  company_code        TEXT,
  branch_code         TEXT
);
CREATE INDEX idx_ws_reading_captured ON ws_reading (captured_at_client DESC);
CREATE INDEX idx_ws_reading_sync ON ws_reading (sync_status);
CREATE INDEX idx_ws_reading_batch ON ws_reading (product_name, batch_no);

CREATE TABLE ws_balance_check (
  check_uuid          TEXT PRIMARY KEY,
  scale_id            TEXT NOT NULL,
  operator            TEXT NOT NULL,
  checked_at_client   TEXT NOT NULL,
  points_json         TEXT NOT NULL,                 -- [{point, nominal, tolerance, actual, pass, certId}]
  overall_pass        INTEGER NOT NULL,              -- 1 pass / 0 fail
  cleared_by          TEXT,                          -- QA user who cleared a FAIL block
  cleared_at          TEXT,
  sync_status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING','SYNCED')),
  synced_at           TEXT
);
CREATE INDEX idx_ws_balance_check_day ON ws_balance_check (scale_id, checked_at_client DESC);

-- Append-only audit trail (Part 11): every create/void/clear event, locally
-- recorded and synced like any other entity. Never updated, never deleted.
CREATE TABLE ws_audit (
  audit_uuid   TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_uuid  TEXT NOT NULL,
  event        TEXT NOT NULL,                        -- e.g. READING_CAPTURED, READING_VOIDED, CHECK_RECORDED
  actor        TEXT NOT NULL,
  at_client    TEXT NOT NULL,
  detail_json  TEXT,                                 -- old→new values where applicable
  sync_status  TEXT NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING','SYNCED')),
  synced_at    TEXT
);
CREATE INDEX idx_ws_audit_entity ON ws_audit (entity_type, entity_uuid);

-- Transactional outbox — written in the SAME transaction as the business row.
-- UK coalesces repeated pending events per entity+operation (latest wins).
CREATE TABLE ws_sync_outbox (
  outbox_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type     TEXT NOT NULL,                     -- READING | VOID | BALANCE_CHECK | AUDIT
  entity_uuid     TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('CREATE','UPDATE')),
  payload         TEXT NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'QUEUED' CHECK (sync_status IN ('QUEUED','SENDING','SYNCED','RETRYING','DEAD_LETTER')),
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 10,
  last_error      TEXT,
  next_attempt_at TEXT,
  created_at      TEXT NOT NULL,
  sent_at         TEXT,
  acked_at        TEXT,
  UNIQUE (entity_type, entity_uuid, operation)
);
CREATE INDEX idx_ws_outbox_due ON ws_sync_outbox (sync_status, next_attempt_at);

-- Offline-unlock credential cache (Phase 3): populated on successful ONLINE
-- login only. pwd_verifier is a PBKDF2 hash — never the password or a token.
CREATE TABLE ws_user_cache (
  user_name         TEXT PRIMARY KEY,
  display_name      TEXT,
  pwd_verifier      TEXT NOT NULL,
  role              TEXT,
  menu_json         TEXT,
  last_online_login TEXT NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1
);

-- Product/category master cache (Phase 4 pull-down) so the session-card picker
-- works offline. Masters are edited online-only; this is a read replica.
CREATE TABLE ws_product_cache (
  product_code   TEXT PRIMARY KEY,
  product_name   TEXT NOT NULL,
  manufacturer   TEXT,
  category_code  TEXT,
  nominal_weight REAL,
  tolerance      REAL,
  unit           TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  pulled_at      TEXT NOT NULL
);
CREATE TABLE ws_category_cache (
  category_code TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 0,
  pulled_at     TEXT NOT NULL
);

CREATE TABLE ws_table_sync_meta (
  table_name     TEXT PRIMARY KEY,
  last_cursor    TEXT,
  last_synced_at TEXT,
  row_count      INTEGER,
  last_status    TEXT
);

CREATE TABLE ws_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);
