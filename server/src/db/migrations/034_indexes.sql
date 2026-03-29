-- Add missing indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_device_ips_device_primary ON device_ips(device_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_device_tags_device ON device_tags(device_id);
CREATE INDEX IF NOT EXISTS idx_credentials_device ON credentials(device_id);
CREATE INDEX IF NOT EXISTS idx_connections_source_device ON connections(source_device_id);
CREATE INDEX IF NOT EXISTS idx_connections_target_device ON connections(target_device_id);
CREATE INDEX IF NOT EXISTS idx_connections_source_subnet ON connections(source_subnet_id);
CREATE INDEX IF NOT EXISTS idx_connections_target_subnet ON connections(target_subnet_id);
CREATE INDEX IF NOT EXISTS idx_node_preferences_project ON node_preferences(project_id);
CREATE INDEX IF NOT EXISTS idx_diagram_annotations_project ON diagram_annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_command_outputs_device ON command_outputs(device_id);
CREATE INDEX IF NOT EXISTS idx_device_ports_device ON device_ports(device_id);
CREATE INDEX IF NOT EXISTS idx_device_images_device ON device_images(device_id);
CREATE INDEX IF NOT EXISTS idx_device_attachments_device ON device_attachments(device_id);
CREATE INDEX IF NOT EXISTS idx_diagram_positions_view ON diagram_positions(view_id);
CREATE INDEX IF NOT EXISTS idx_subnet_diagram_positions_view ON subnet_diagram_positions(view_id);
