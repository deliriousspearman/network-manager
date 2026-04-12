-- Add 'arp' command type and parsed_arp table
-- SQLite requires table recreation to change a CHECK constraint
PRAGMA foreign_keys = OFF;

ALTER TABLE command_outputs RENAME TO command_outputs_old;

CREATE TABLE command_outputs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL CHECK(command_type IN ('ps','netstat','last','ip_a','mount','ip_r','freeform','systemctl_status','arp')),
    raw_output   TEXT NOT NULL,
    captured_at  TEXT DEFAULT (datetime('now')),
    project_id   INTEGER NOT NULL DEFAULT 1,
    title        TEXT,
    parse_output INTEGER NOT NULL DEFAULT 1
);

INSERT INTO command_outputs SELECT * FROM command_outputs_old;
DROP TABLE command_outputs_old;

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parsed_arp (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id      INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    ip             TEXT,
    mac_address    TEXT,
    interface_name TEXT
);
