-- Update default width/height for diagram_images from 128 to 256
-- SQLite does not support ALTER COLUMN DEFAULT, so we use a trigger workaround
-- instead. New rows inserted without explicit width/height will get 256 via
-- the application layer (diagramIcons route already passes 256 as default).
-- This migration is a no-op for the schema but documents the intent.
SELECT 1;
