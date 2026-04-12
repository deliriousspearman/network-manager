-- Agents table for tracking monitoring/security agents installed on devices
CREATE TABLE IF NOT EXISTS agents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  agent_type      TEXT NOT NULL,
  device_id       INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  checkin_schedule TEXT,
  config          TEXT,
  disk_path       TEXT,
  status          TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','error','unknown')),
  version         TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_device ON agents(device_id);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(project_id, agent_type);
