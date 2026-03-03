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

-- notes tied to class + optional assignment, stored locally on this computer
CREATE TABLE IF NOT EXISTS class_notes (
  id TEXT PRIMARY KEY,
  class_key TEXT NOT NULL,
  assignment_key TEXT,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'pasted',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_class_notes_class_updated ON class_notes(class_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_notes_assignment_updated ON class_notes(assignment_key, updated_at DESC);


-- local calendar events + reminders
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_at INTEGER NOT NULL,
  end_at INTEGER,
  reminder_minutes INTEGER NOT NULL DEFAULT 30,
  reminder_dismissed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_at);


-- local inbox cache + generated outputs
CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,
  from_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_received ON inbox_messages(received_at DESC);

CREATE TABLE IF NOT EXISTS inbox_outputs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL, -- summary | draft
  target_message_id TEXT,
  content_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(target_message_id) REFERENCES inbox_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inbox_outputs_kind_created ON inbox_outputs(kind, created_at DESC);

-- class information managed per semester
CREATE TABLE IF NOT EXISTS class_profiles (
  id TEXT PRIMARY KEY,
  semester_key TEXT NOT NULL,
  class_code TEXT NOT NULL,
  class_name TEXT NOT NULL,
  instructor TEXT,
  meeting_schedule TEXT,
  location TEXT,
  notes_md TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_class_profiles_semester ON class_profiles(semester_key, class_code);
