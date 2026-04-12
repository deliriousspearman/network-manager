-- Router configs feature: stores raw vendor configs + parsed entities
-- Mirrors the command_outputs architecture but for router configuration files

CREATE TABLE IF NOT EXISTS router_configs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id       INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    project_id      INTEGER NOT NULL DEFAULT 1,
    vendor          TEXT NOT NULL CHECK(vendor IN ('cisco','unifi','mikrotik','juniper','fortigate','pfsense')),
    raw_config      TEXT NOT NULL,
    captured_at     TEXT DEFAULT (datetime('now')),
    title           TEXT,
    parse_output    INTEGER NOT NULL DEFAULT 1,
    -- System metadata extracted at parse time (1:1 with config)
    hostname        TEXT,
    os_version      TEXT,
    model           TEXT,
    domain          TEXT,
    timezone        TEXT,
    ntp_servers     TEXT -- JSON array of strings
);

CREATE INDEX IF NOT EXISTS idx_router_configs_device_captured ON router_configs(device_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_router_configs_project ON router_configs(project_id);

CREATE TABLE IF NOT EXISTS parsed_router_interfaces (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id       INTEGER NOT NULL REFERENCES router_configs(id) ON DELETE CASCADE,
    interface_name  TEXT NOT NULL,
    description     TEXT,
    ip_address      TEXT,
    subnet_mask     TEXT,
    vlan            INTEGER,
    admin_status    TEXT,
    mac_address     TEXT
);
CREATE INDEX IF NOT EXISTS idx_parsed_router_interfaces_config ON parsed_router_interfaces(config_id);

CREATE TABLE IF NOT EXISTS parsed_router_vlans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id       INTEGER NOT NULL REFERENCES router_configs(id) ON DELETE CASCADE,
    vlan_id         INTEGER NOT NULL,
    name            TEXT
);
CREATE INDEX IF NOT EXISTS idx_parsed_router_vlans_config ON parsed_router_vlans(config_id);

CREATE TABLE IF NOT EXISTS parsed_router_static_routes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id       INTEGER NOT NULL REFERENCES router_configs(id) ON DELETE CASCADE,
    destination     TEXT NOT NULL,
    mask            TEXT,
    next_hop        TEXT,
    metric          INTEGER,
    admin_distance  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_parsed_router_static_routes_config ON parsed_router_static_routes(config_id);

CREATE TABLE IF NOT EXISTS parsed_router_acls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id       INTEGER NOT NULL REFERENCES router_configs(id) ON DELETE CASCADE,
    acl_name        TEXT NOT NULL,
    sequence        INTEGER,
    action          TEXT NOT NULL,
    protocol        TEXT,
    src             TEXT,
    src_port        TEXT,
    dst             TEXT,
    dst_port        TEXT
);
CREATE INDEX IF NOT EXISTS idx_parsed_router_acls_config ON parsed_router_acls(config_id);

CREATE TABLE IF NOT EXISTS parsed_router_nat_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id       INTEGER NOT NULL REFERENCES router_configs(id) ON DELETE CASCADE,
    nat_type        TEXT NOT NULL,
    protocol        TEXT,
    inside_src      TEXT,
    inside_port     TEXT,
    outside_src     TEXT,
    outside_port    TEXT
);
CREATE INDEX IF NOT EXISTS idx_parsed_router_nat_rules_config ON parsed_router_nat_rules(config_id);

CREATE TABLE IF NOT EXISTS parsed_router_dhcp_pools (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id       INTEGER NOT NULL REFERENCES router_configs(id) ON DELETE CASCADE,
    pool_name       TEXT NOT NULL,
    network         TEXT,
    netmask         TEXT,
    default_router  TEXT,
    dns_servers     TEXT, -- JSON array
    lease_time      TEXT,
    domain_name     TEXT
);
CREATE INDEX IF NOT EXISTS idx_parsed_router_dhcp_pools_config ON parsed_router_dhcp_pools(config_id);

CREATE TABLE IF NOT EXISTS parsed_router_users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id       INTEGER NOT NULL REFERENCES router_configs(id) ON DELETE CASCADE,
    username        TEXT NOT NULL,
    privilege       INTEGER,
    auth_method     TEXT
);
CREATE INDEX IF NOT EXISTS idx_parsed_router_users_config ON parsed_router_users(config_id);
