CREATE TABLE IF NOT EXISTS timeline_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  event_date  TEXT NOT NULL DEFAULT (datetime('now')),
  category    TEXT NOT NULL DEFAULT 'general',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_timeline_entries_project ON timeline_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_timeline_entries_event_date ON timeline_entries(project_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_entries_category ON timeline_entries(project_id, category);
