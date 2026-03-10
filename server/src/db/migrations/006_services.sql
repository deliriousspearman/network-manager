-- Add systemctl_status command type and parsed_services table
-- SQLite requires table recreation to change a CHECK constraint
PRAGMA foreign_keys = OFF;

ALTER TABLE command_outputs RENAME TO command_outputs_old;

CREATE TABLE command_outputs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL CHECK(command_type IN ('ps','netstat','last','ip_a','mount','ip_r','freeform','systemctl_status')),
    raw_output   TEXT NOT NULL,
    captured_at  TEXT DEFAULT (datetime('now'))
);

INSERT INTO command_outputs SELECT * FROM command_outputs_old;
DROP TABLE command_outputs_old;

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parsed_services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    unit_name   TEXT,
    load        TEXT,
    active      TEXT,
    sub         TEXT,
    description TEXT
);
