CREATE TABLE IF NOT EXISTS agent_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  icon_source TEXT NOT NULL CHECK(icon_source IN ('builtin','upload')),
  icon_builtin_key TEXT,
  filename TEXT,
  mime_type TEXT,
  file_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, key)
);
CREATE INDEX IF NOT EXISTS idx_agent_types_project ON agent_types(project_id);

DROP TABLE IF EXISTS agent_type_icons;
