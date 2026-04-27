-- Migration 063 used `ALTER TABLE command_outputs RENAME TO command_outputs_old` to
-- rebuild the table for a CHECK constraint change. Modern SQLite (>= 3.25) rewrites
-- foreign-key references in dependent tables when a table is renamed, so every
-- parsed_* table's FK now points at the now-dropped command_outputs_old. Same kind
-- of damage that migration 041 fixed before — rebuild the parsed_* tables with the
-- correct FK target. parsed_user_history was created post-rename in 063 and is
-- already correct, so it isn't listed.
PRAGMA foreign_keys = OFF;

-- parsed_processes
CREATE TABLE parsed_processes_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    pid         INTEGER,
    user        TEXT,
    cpu_percent REAL,
    mem_percent REAL,
    command     TEXT
);
INSERT INTO parsed_processes_new SELECT * FROM parsed_processes;
DROP TABLE parsed_processes;
ALTER TABLE parsed_processes_new RENAME TO parsed_processes;
CREATE INDEX IF NOT EXISTS idx_parsed_processes_output ON parsed_processes(output_id);

-- parsed_connections
CREATE TABLE parsed_connections_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id    INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    protocol     TEXT,
    local_addr   TEXT,
    foreign_addr TEXT,
    state        TEXT,
    pid_program  TEXT
);
INSERT INTO parsed_connections_new SELECT * FROM parsed_connections;
DROP TABLE parsed_connections;
ALTER TABLE parsed_connections_new RENAME TO parsed_connections;
CREATE INDEX IF NOT EXISTS idx_parsed_connections_output ON parsed_connections(output_id);

-- parsed_logins
CREATE TABLE parsed_logins_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    user        TEXT,
    terminal    TEXT,
    source_ip   TEXT,
    login_time  TEXT,
    duration    TEXT
);
INSERT INTO parsed_logins_new SELECT * FROM parsed_logins;
DROP TABLE parsed_logins;
ALTER TABLE parsed_logins_new RENAME TO parsed_logins;
CREATE INDEX IF NOT EXISTS idx_parsed_logins_output ON parsed_logins(output_id);

-- parsed_interfaces
CREATE TABLE parsed_interfaces_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id      INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    interface_name TEXT,
    state          TEXT,
    ip_addresses   TEXT,
    mac_address    TEXT
);
INSERT INTO parsed_interfaces_new SELECT * FROM parsed_interfaces;
DROP TABLE parsed_interfaces;
ALTER TABLE parsed_interfaces_new RENAME TO parsed_interfaces;
CREATE INDEX IF NOT EXISTS idx_parsed_interfaces_output ON parsed_interfaces(output_id);

-- parsed_mounts
CREATE TABLE parsed_mounts_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    device      TEXT,
    mount_point TEXT,
    fs_type     TEXT,
    options     TEXT
);
INSERT INTO parsed_mounts_new SELECT * FROM parsed_mounts;
DROP TABLE parsed_mounts;
ALTER TABLE parsed_mounts_new RENAME TO parsed_mounts;
CREATE INDEX IF NOT EXISTS idx_parsed_mounts_output ON parsed_mounts(output_id);

-- parsed_routes
CREATE TABLE parsed_routes_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    destination TEXT,
    gateway     TEXT,
    device      TEXT,
    protocol    TEXT,
    scope       TEXT,
    metric      TEXT
);
INSERT INTO parsed_routes_new SELECT * FROM parsed_routes;
DROP TABLE parsed_routes;
ALTER TABLE parsed_routes_new RENAME TO parsed_routes;
CREATE INDEX IF NOT EXISTS idx_parsed_routes_output ON parsed_routes(output_id);

-- parsed_services
CREATE TABLE parsed_services_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    unit_name   TEXT,
    load        TEXT,
    active      TEXT,
    sub         TEXT,
    description TEXT
);
INSERT INTO parsed_services_new SELECT * FROM parsed_services;
DROP TABLE parsed_services;
ALTER TABLE parsed_services_new RENAME TO parsed_services;
CREATE INDEX IF NOT EXISTS idx_parsed_services_output ON parsed_services(output_id);

-- parsed_arp (added in migration 040, also broken by 063's rename)
CREATE TABLE parsed_arp_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id      INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    ip             TEXT,
    mac_address    TEXT,
    interface_name TEXT
);
INSERT INTO parsed_arp_new SELECT * FROM parsed_arp;
DROP TABLE parsed_arp;
ALTER TABLE parsed_arp_new RENAME TO parsed_arp;

PRAGMA foreign_keys = ON;
