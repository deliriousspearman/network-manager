-- Bundled icon libraries: extend device_type_icons and device_icon_overrides so a
-- row can reference a library entry by (library_id, library_icon_key) instead of
-- carrying its own bytes. Mirrors the agent_types pattern (056_agent_types.sql).
--
-- The original tables (033_diagram_icons.sql) declared filename/mime_type/data
-- as NOT NULL. Library-source rows leave those NULL, so we recreate the tables
-- with nullable blob columns plus the three new columns. Existing rows preserve
-- their data and default to icon_source='upload'.

CREATE TABLE device_type_icons_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT,
  data TEXT,
  file_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  icon_source TEXT NOT NULL DEFAULT 'upload' CHECK(icon_source IN ('upload','library')),
  library_id TEXT,
  library_icon_key TEXT,
  UNIQUE(project_id, device_type)
);

INSERT INTO device_type_icons_new (id, project_id, device_type, filename, mime_type, data, file_path, created_at)
  SELECT id, project_id, device_type, filename, mime_type, data, file_path, created_at FROM device_type_icons;

DROP TABLE device_type_icons;
ALTER TABLE device_type_icons_new RENAME TO device_type_icons;


CREATE TABLE device_icon_overrides_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT,
  mime_type TEXT,
  data TEXT,
  file_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  icon_source TEXT NOT NULL DEFAULT 'upload' CHECK(icon_source IN ('upload','library')),
  library_id TEXT,
  library_icon_key TEXT,
  UNIQUE(device_id, project_id)
);

INSERT INTO device_icon_overrides_new (id, device_id, project_id, filename, mime_type, data, file_path, created_at)
  SELECT id, device_id, project_id, filename, mime_type, data, file_path, created_at FROM device_icon_overrides;

DROP TABLE device_icon_overrides;
ALTER TABLE device_icon_overrides_new RENAME TO device_icon_overrides;
