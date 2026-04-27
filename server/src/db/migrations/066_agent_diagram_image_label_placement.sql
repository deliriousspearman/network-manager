-- Caption placement for agent diagram images.
-- label_placement_v: above | middle | below (default below — preserves pre-existing caption position)
-- label_placement_h: left  | middle | right (default middle)
ALTER TABLE agent_diagram_images ADD COLUMN label_placement_v TEXT NOT NULL DEFAULT 'below';
ALTER TABLE agent_diagram_images ADD COLUMN label_placement_h TEXT NOT NULL DEFAULT 'middle';
