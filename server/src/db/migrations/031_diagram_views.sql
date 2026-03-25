-- Create diagram views table
CREATE TABLE IF NOT EXISTS diagram_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert a default view for every project that has diagram data
INSERT INTO diagram_views (project_id, name, is_default)
SELECT DISTINCT p.id, 'Default', 1
FROM projects p;

-- Recreate diagram_positions with view_id
CREATE TABLE diagram_positions_new (
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  view_id INTEGER NOT NULL REFERENCES diagram_views(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, view_id)
);

INSERT INTO diagram_positions_new (device_id, view_id, x, y)
SELECT dp.device_id, dv.id, dp.x, dp.y
FROM diagram_positions dp
JOIN devices d ON dp.device_id = d.id
JOIN diagram_views dv ON dv.project_id = d.project_id AND dv.is_default = 1;

DROP TABLE diagram_positions;
ALTER TABLE diagram_positions_new RENAME TO diagram_positions;

-- Recreate subnet_diagram_positions with view_id
CREATE TABLE subnet_diagram_positions_new (
  subnet_id INTEGER NOT NULL REFERENCES subnets(id) ON DELETE CASCADE,
  view_id INTEGER NOT NULL REFERENCES diagram_views(id) ON DELETE CASCADE,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 400,
  height REAL NOT NULL DEFAULT 300,
  PRIMARY KEY (subnet_id, view_id)
);

INSERT INTO subnet_diagram_positions_new (subnet_id, view_id, x, y, width, height)
SELECT sp.subnet_id, dv.id, sp.x, sp.y, sp.width, sp.height
FROM subnet_diagram_positions sp
JOIN subnets s ON sp.subnet_id = s.id
JOIN diagram_views dv ON dv.project_id = s.project_id AND dv.is_default = 1;

DROP TABLE subnet_diagram_positions;
ALTER TABLE subnet_diagram_positions_new RENAME TO subnet_diagram_positions;

-- Add view_id to annotations
ALTER TABLE diagram_annotations ADD COLUMN view_id INTEGER REFERENCES diagram_views(id) ON DELETE CASCADE;

UPDATE diagram_annotations SET view_id = (
  SELECT dv.id FROM diagram_views dv WHERE dv.project_id = diagram_annotations.project_id AND dv.is_default = 1 LIMIT 1
);
