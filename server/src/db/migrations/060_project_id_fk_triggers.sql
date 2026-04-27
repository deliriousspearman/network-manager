-- Enforce project_id referential integrity on tables that pre-date migration 012.
-- That migration added project_id via ALTER TABLE ADD COLUMN, which SQLite cannot
-- extend with a REFERENCES clause. Rebuilding those tables now would be invasive
-- (large data copy, broken prepared statements, many dependent indexes/triggers).
-- Instead, triggers give us the same insert/update guarantee without the risk.
--
-- CASCADE delete on projects is already handled by the projects route at the
-- application level (projects.ts runs deletes for every project-scoped table).

-- Purge any dangling rows left from past bugs before installing the check, so
-- the trigger doesn't refuse valid updates on legacy data.
DELETE FROM subnets WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM devices WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM connections WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM credentials WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM highlight_rules WHERE project_id NOT IN (SELECT id FROM projects);
DELETE FROM command_outputs WHERE project_id NOT IN (SELECT id FROM projects);

-- subnets
CREATE TRIGGER IF NOT EXISTS trg_subnets_project_fk_ins
BEFORE INSERT ON subnets
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'subnets.project_id references unknown project');
END;

CREATE TRIGGER IF NOT EXISTS trg_subnets_project_fk_upd
BEFORE UPDATE OF project_id ON subnets
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'subnets.project_id references unknown project');
END;

-- devices
CREATE TRIGGER IF NOT EXISTS trg_devices_project_fk_ins
BEFORE INSERT ON devices
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'devices.project_id references unknown project');
END;

CREATE TRIGGER IF NOT EXISTS trg_devices_project_fk_upd
BEFORE UPDATE OF project_id ON devices
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'devices.project_id references unknown project');
END;

-- connections
CREATE TRIGGER IF NOT EXISTS trg_connections_project_fk_ins
BEFORE INSERT ON connections
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'connections.project_id references unknown project');
END;

CREATE TRIGGER IF NOT EXISTS trg_connections_project_fk_upd
BEFORE UPDATE OF project_id ON connections
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'connections.project_id references unknown project');
END;

-- credentials
CREATE TRIGGER IF NOT EXISTS trg_credentials_project_fk_ins
BEFORE INSERT ON credentials
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'credentials.project_id references unknown project');
END;

CREATE TRIGGER IF NOT EXISTS trg_credentials_project_fk_upd
BEFORE UPDATE OF project_id ON credentials
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'credentials.project_id references unknown project');
END;

-- highlight_rules
CREATE TRIGGER IF NOT EXISTS trg_highlight_rules_project_fk_ins
BEFORE INSERT ON highlight_rules
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'highlight_rules.project_id references unknown project');
END;

CREATE TRIGGER IF NOT EXISTS trg_highlight_rules_project_fk_upd
BEFORE UPDATE OF project_id ON highlight_rules
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'highlight_rules.project_id references unknown project');
END;

-- command_outputs
CREATE TRIGGER IF NOT EXISTS trg_command_outputs_project_fk_ins
BEFORE INSERT ON command_outputs
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'command_outputs.project_id references unknown project');
END;

CREATE TRIGGER IF NOT EXISTS trg_command_outputs_project_fk_upd
BEFORE UPDATE OF project_id ON command_outputs
FOR EACH ROW
WHEN NEW.project_id IS NOT NULL
  AND (SELECT 1 FROM projects WHERE id = NEW.project_id) IS NULL
BEGIN
  SELECT RAISE(ABORT, 'command_outputs.project_id references unknown project');
END;
