-- Indices on output_id for parsed_* tables.
-- All parsed rows are almost always fetched by output_id; without these,
-- SQLite scans the whole parsed table. Router-config parsed tables already
-- have their config_id indices from migration 048.

CREATE INDEX IF NOT EXISTS idx_parsed_processes_output ON parsed_processes(output_id);
CREATE INDEX IF NOT EXISTS idx_parsed_connections_output ON parsed_connections(output_id);
CREATE INDEX IF NOT EXISTS idx_parsed_logins_output ON parsed_logins(output_id);
CREATE INDEX IF NOT EXISTS idx_parsed_interfaces_output ON parsed_interfaces(output_id);
CREATE INDEX IF NOT EXISTS idx_parsed_mounts_output ON parsed_mounts(output_id);
CREATE INDEX IF NOT EXISTS idx_parsed_routes_output ON parsed_routes(output_id);
CREATE INDEX IF NOT EXISTS idx_parsed_services_output ON parsed_services(output_id);
