ALTER TABLE projects ADD COLUMN short_name TEXT NOT NULL DEFAULT '';
UPDATE projects SET short_name = UPPER(SUBSTR(name, 1, 2)) WHERE short_name = '';
