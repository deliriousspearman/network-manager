-- Add camera and phone device types
-- SQLite requires table rebuild to modify CHECK constraints
PRAGMA foreign_keys = OFF;

CREATE TABLE devices_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('server','workstation','router','switch','nas','firewall','access_point','iot','camera','phone')),
    mac_address TEXT,
    os          TEXT,
    location    TEXT,
    notes       TEXT,
    subnet_id   INTEGER REFERENCES subnets(id) ON DELETE SET NULL,
    hosting_type TEXT DEFAULT NULL,
    hypervisor_id INTEGER REFERENCES devices_new(id) ON DELETE SET NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    project_id  INTEGER NOT NULL DEFAULT 1
);

INSERT INTO devices_new SELECT * FROM devices;

DROP TABLE devices;

ALTER TABLE devices_new RENAME TO devices;

CREATE INDEX IF NOT EXISTS idx_devices_project ON devices(project_id);

PRAGMA foreign_keys = ON;
