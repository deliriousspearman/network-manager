ALTER TABLE device_type_icons ADD COLUMN file_path TEXT;
ALTER TABLE device_icon_overrides ADD COLUMN file_path TEXT;
ALTER TABLE agent_type_icons ADD COLUMN file_path TEXT;
ALTER TABLE diagram_images ADD COLUMN file_path TEXT;
ALTER TABLE device_images ADD COLUMN file_path TEXT;
ALTER TABLE device_attachments ADD COLUMN file_path TEXT;
ALTER TABLE image_library ADD COLUMN file_path TEXT;
