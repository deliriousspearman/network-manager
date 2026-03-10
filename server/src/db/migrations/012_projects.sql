-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert a default project for existing data
INSERT OR IGNORE INTO projects (id, name, slug, description)
VALUES (1, 'Default', 'default', 'Default project');

-- Add project_id to top-level tables
-- Note: SQLite ALTER TABLE ADD COLUMN cannot have REFERENCES with non-NULL default,
-- so we add the column without FK constraint. Integrity is enforced at application level
-- and via CASCADE deletes handled in the projects route.
ALTER TABLE subnets ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE devices ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE connections ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE credentials ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE highlight_rules ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE command_outputs ADD COLUMN project_id INTEGER NOT NULL DEFAULT 1;

-- Indexes for project_id filtering
CREATE INDEX IF NOT EXISTS idx_subnets_project ON subnets(project_id);
CREATE INDEX IF NOT EXISTS idx_devices_project ON devices(project_id);
CREATE INDEX IF NOT EXISTS idx_connections_project ON connections(project_id);
CREATE INDEX IF NOT EXISTS idx_credentials_project ON credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_highlight_rules_project ON highlight_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_command_outputs_project ON command_outputs(project_id);
