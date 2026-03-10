-- Add new device types: nas, firewall, access_point, iot
-- SQLite requires table rebuild to modify CHECK constraints
PRAGMA foreign_keys = OFF;

CREATE TABLE devices_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('server','workstation','router','switch','nas','firewall','access_point','iot')),
    mac_address TEXT,
    os          TEXT,
    location    TEXT,
    notes       TEXT,
    subnet_id   INTEGER REFERENCES subnets(id) ON DELETE SET NULL,
    hosting_type TEXT DEFAULT NULL,
    hypervisor_id INTEGER REFERENCES devices_new(id) ON DELETE SET NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

INSERT INTO devices_new SELECT * FROM devices;

DROP TABLE devices;

ALTER TABLE devices_new RENAME TO devices;

PRAGMA foreign_keys = ON;
