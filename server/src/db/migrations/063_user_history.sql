-- Add 'user_history' command type and parsed_user_history table.
-- SQLite requires table recreation to change a CHECK constraint.
PRAGMA foreign_keys = OFF;

ALTER TABLE command_outputs RENAME TO command_outputs_old;

CREATE TABLE command_outputs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL CHECK(command_type IN ('ps','netstat','last','ip_a','mount','ip_r','freeform','systemctl_status','arp','user_history')),
    raw_output   TEXT NOT NULL,
    captured_at  TEXT DEFAULT (datetime('now')),
    project_id   INTEGER NOT NULL DEFAULT 1,
    title        TEXT,
    parse_output INTEGER NOT NULL DEFAULT 1,
    updated_at   TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'
);

INSERT INTO command_outputs (id, device_id, command_type, raw_output, captured_at, project_id, title, parse_output, updated_at)
SELECT id, device_id, command_type, raw_output, captured_at, project_id, title, parse_output, updated_at
FROM command_outputs_old;

DROP TABLE command_outputs_old;

PRAGMA foreign_keys = ON;

-- Recreate the index attached to the dropped table (from migration 045).
CREATE INDEX IF NOT EXISTS idx_command_outputs_device_captured ON command_outputs (device_id, captured_at DESC);

-- Recreate the project_id FK triggers attached to the dropped table (from migration 060).
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

CREATE TABLE IF NOT EXISTS parsed_user_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    line_no     INTEGER NOT NULL,
    timestamp   TEXT,
    command     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parsed_user_history_output ON parsed_user_history(output_id);
