-- Composite indexes for common query patterns

-- device_ips: frequently queried by (device_id, is_primary) in device detail and diagram
CREATE INDEX IF NOT EXISTS idx_device_ips_device_primary ON device_ips (device_id, is_primary);

-- activity_logs: filtered by resource_type within a project
CREATE INDEX IF NOT EXISTS idx_activity_logs_project_resource ON activity_logs (project_id, resource_type);

-- device_subnets: looked up by subnet_id for subnet membership in diagram
CREATE INDEX IF NOT EXISTS idx_device_subnets_subnet ON device_subnets (subnet_id);

-- command_outputs: ordered by captured_at desc per device
CREATE INDEX IF NOT EXISTS idx_command_outputs_device_captured ON command_outputs (device_id, captured_at DESC);
