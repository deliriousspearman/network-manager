-- Add metadata fields to agent_diagram_images so blobs can be served back
-- with the correct content-type and labelled like the device diagram images.
ALTER TABLE agent_diagram_images ADD COLUMN filename  TEXT;
ALTER TABLE agent_diagram_images ADD COLUMN mime_type TEXT;
ALTER TABLE agent_diagram_images ADD COLUMN label     TEXT;
