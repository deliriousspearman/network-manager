-- Allow agent_connections to terminate at agent_diagram_images, not just agents.
-- SQLite cannot ALTER away NOT NULL on existing columns, so recreate the table.
CREATE TABLE agent_connections_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
  source_image_id INTEGER REFERENCES agent_diagram_images(id) ON DELETE CASCADE,
  target_image_id INTEGER REFERENCES agent_diagram_images(id) ON DELETE CASCADE,
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
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  -- Exactly one source endpoint kind, exactly one target endpoint kind.
  CHECK ((source_agent_id IS NOT NULL) + (source_image_id IS NOT NULL) = 1),
  CHECK ((target_agent_id IS NOT NULL) + (target_image_id IS NOT NULL) = 1)
);

INSERT INTO agent_connections_new (
  id, project_id, source_agent_id, target_agent_id,
  label, connection_type, edge_color, edge_width,
  label_color, label_bg_color, source_handle, target_handle,
  source_port, target_port, created_at
)
SELECT
  id, project_id, source_agent_id, target_agent_id,
  label, connection_type, edge_color, edge_width,
  label_color, label_bg_color, source_handle, target_handle,
  source_port, target_port, created_at
FROM agent_connections;

DROP TABLE agent_connections;
ALTER TABLE agent_connections_new RENAME TO agent_connections;

CREATE INDEX IF NOT EXISTS idx_agent_connections_project ON agent_connections(project_id);
