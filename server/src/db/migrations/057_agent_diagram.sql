-- Agent Network Map schema — parallel to the device diagram tables.
-- Views, positions, connections, annotations, and images are all scoped to
-- the agent map independently of the device diagram so the two can evolve
-- without colliding.

CREATE TABLE IF NOT EXISTS agent_diagram_views (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Default',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed a default view per existing project so GET / always has something to return.
INSERT INTO agent_diagram_views (project_id, name, is_default)
SELECT id, 'Default', 1 FROM projects
WHERE NOT EXISTS (
  SELECT 1 FROM agent_diagram_views v WHERE v.project_id = projects.id
);

CREATE TABLE IF NOT EXISTS agent_diagram_positions (
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  view_id  INTEGER NOT NULL REFERENCES agent_diagram_views(id) ON DELETE CASCADE,
  x        REAL NOT NULL DEFAULT 0,
  y        REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, view_id)
);

-- Directional edges between agents (arrow source -> target).
CREATE TABLE IF NOT EXISTS agent_connections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  label           TEXT,
  connection_type TEXT DEFAULT 'link',
  edge_color      TEXT,
  edge_width      INTEGER,
  label_color     TEXT,
  label_bg_color  TEXT,
  source_handle   TEXT,
  target_handle   TEXT,
  source_port     TEXT,
  target_port     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_connections_project ON agent_connections(project_id);

CREATE TABLE IF NOT EXISTS agent_diagram_annotations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  view_id    INTEGER NOT NULL REFERENCES agent_diagram_views(id) ON DELETE CASCADE,
  text       TEXT NOT NULL DEFAULT 'Text',
  x          REAL NOT NULL DEFAULT 0,
  y          REAL NOT NULL DEFAULT 0,
  font_size  INTEGER NOT NULL DEFAULT 14,
  color      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_diagram_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  view_id    INTEGER NOT NULL REFERENCES agent_diagram_views(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,
  x          REAL NOT NULL DEFAULT 0,
  y          REAL NOT NULL DEFAULT 0,
  width      REAL NOT NULL DEFAULT 200,
  height     REAL NOT NULL DEFAULT 150,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
