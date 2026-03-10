-- Fix FK references in parsed_* tables that were broken by the migration 006
-- table rename (SQLite auto-updated references to command_outputs_old which was then dropped)
PRAGMA foreign_keys = OFF;

ALTER TABLE parsed_processes RENAME TO parsed_processes_old;
CREATE TABLE parsed_processes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    pid         INTEGER,
    user        TEXT,
    cpu_percent REAL,
    mem_percent REAL,
    command     TEXT
);
INSERT INTO parsed_processes SELECT * FROM parsed_processes_old;
DROP TABLE parsed_processes_old;

ALTER TABLE parsed_connections RENAME TO parsed_connections_old;
CREATE TABLE parsed_connections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id    INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    protocol     TEXT,
    local_addr   TEXT,
    foreign_addr TEXT,
    state        TEXT,
    pid_program  TEXT
);
INSERT INTO parsed_connections SELECT * FROM parsed_connections_old;
DROP TABLE parsed_connections_old;

ALTER TABLE parsed_logins RENAME TO parsed_logins_old;
CREATE TABLE parsed_logins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    user        TEXT,
    terminal    TEXT,
    source_ip   TEXT,
    login_time  TEXT,
    duration    TEXT
);
INSERT INTO parsed_logins SELECT * FROM parsed_logins_old;
DROP TABLE parsed_logins_old;

ALTER TABLE parsed_interfaces RENAME TO parsed_interfaces_old;
CREATE TABLE parsed_interfaces (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id       INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    interface_name  TEXT,
    state           TEXT,
    ip_addresses    TEXT,
    mac_address     TEXT
);
INSERT INTO parsed_interfaces SELECT * FROM parsed_interfaces_old;
DROP TABLE parsed_interfaces_old;

ALTER TABLE parsed_mounts RENAME TO parsed_mounts_old;
CREATE TABLE parsed_mounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    device      TEXT,
    mount_point TEXT,
    fs_type     TEXT,
    options     TEXT
);
INSERT INTO parsed_mounts SELECT * FROM parsed_mounts_old;
DROP TABLE parsed_mounts_old;

ALTER TABLE parsed_routes RENAME TO parsed_routes_old;
CREATE TABLE parsed_routes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    destination TEXT,
    gateway     TEXT,
    device      TEXT,
    protocol    TEXT,
    scope       TEXT,
    metric      TEXT
);
INSERT INTO parsed_routes SELECT * FROM parsed_routes_old;
DROP TABLE parsed_routes_old;

PRAGMA foreign_keys = ON;
