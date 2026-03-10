CREATE TABLE IF NOT EXISTS subnets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    cidr        TEXT NOT NULL,
    vlan_id     INTEGER,
    description TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('server','workstation','router','switch')),
    mac_address TEXT,
    os          TEXT,
    location    TEXT,
    notes       TEXT,
    subnet_id   INTEGER REFERENCES subnets(id) ON DELETE SET NULL,
    hosting_type TEXT DEFAULT NULL,
    hypervisor_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS device_ips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ip_address  TEXT NOT NULL,
    label       TEXT,
    is_primary  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS connections (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    target_device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    label            TEXT,
    connection_type  TEXT DEFAULT 'ethernet',
    created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diagram_positions (
    device_id   INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    x           REAL NOT NULL DEFAULT 0,
    y           REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subnet_diagram_positions (
    subnet_id   INTEGER PRIMARY KEY REFERENCES subnets(id) ON DELETE CASCADE,
    x           REAL NOT NULL DEFAULT 0,
    y           REAL NOT NULL DEFAULT 0,
    width       REAL NOT NULL DEFAULT 400,
    height      REAL NOT NULL DEFAULT 300
);

CREATE TABLE IF NOT EXISTS command_outputs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command_type TEXT NOT NULL CHECK(command_type IN ('ps','netstat','last','ip_a','mount','ip_r','freeform')),
    raw_output   TEXT NOT NULL,
    captured_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parsed_processes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    pid         INTEGER,
    user        TEXT,
    cpu_percent REAL,
    mem_percent REAL,
    command     TEXT
);

CREATE TABLE IF NOT EXISTS parsed_connections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id    INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    protocol     TEXT,
    local_addr   TEXT,
    foreign_addr TEXT,
    state        TEXT,
    pid_program  TEXT
);

CREATE TABLE IF NOT EXISTS parsed_logins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    user        TEXT,
    terminal    TEXT,
    source_ip   TEXT,
    login_time  TEXT,
    duration    TEXT
);

CREATE TABLE IF NOT EXISTS parsed_mounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    device      TEXT,
    mount_point TEXT,
    fs_type     TEXT,
    options     TEXT
);

CREATE TABLE IF NOT EXISTS parsed_routes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id   INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    destination TEXT,
    gateway     TEXT,
    device      TEXT,
    protocol    TEXT,
    scope       TEXT,
    metric      TEXT
);

CREATE TABLE IF NOT EXISTS parsed_interfaces (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    output_id       INTEGER NOT NULL REFERENCES command_outputs(id) ON DELETE CASCADE,
    interface_name  TEXT,
    state           TEXT,
    ip_addresses    TEXT,
    mac_address     TEXT
);
