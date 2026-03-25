CREATE TABLE IF NOT EXISTS device_ports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  port_number INTEGER NOT NULL,
  state       TEXT NOT NULL DEFAULT 'OPEN',
  service     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_device_ports_device ON device_ports(device_id);
