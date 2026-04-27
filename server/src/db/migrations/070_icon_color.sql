-- Per-icon color tint (for monochrome SVGs the diagram renders with a CSS
-- mask + background-color). NULL keeps the icon's native colors.
ALTER TABLE device_type_icons ADD COLUMN color TEXT;
ALTER TABLE device_icon_overrides ADD COLUMN color TEXT;
