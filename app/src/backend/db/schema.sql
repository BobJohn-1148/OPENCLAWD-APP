-- Bob Assistant local DB schema (SQLite)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  priority INTEGER NOT NULL DEFAULT 0,
  source_agent_key TEXT,
  target_agent_key TEXT,
  correlation_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_status_created ON events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  agent_key TEXT,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  content_md TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  persona_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_msgs_conv_created ON conversation_messages(conversation_id, created_at);

-- VPS outbox sync items (downloaded + stored locally)
CREATE TABLE IF NOT EXISTS outbox_items (
  id TEXT PRIMARY KEY,
  job TEXT NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  raw_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox_items(created_at);

-- local settings that are not tied to a specific agent
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
