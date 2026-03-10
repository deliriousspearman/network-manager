CREATE TABLE IF NOT EXISTS credentials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id   INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  host        TEXT,
  username    TEXT NOT NULL,
  password    TEXT,
  type        TEXT,
  source      TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
