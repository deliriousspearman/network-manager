-- Fix parsed table FKs after 040 renamed command_outputs
-- SQLite auto-updated FK references to command_outputs_old (now dropped)
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

PRAGMA foreign_keys = ON;
