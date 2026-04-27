-- Track when a credential was last accessed so users can audit which
-- credentials are dormant. Bumped by GET /credentials/:id/file (download)
-- and by GET /credentials/:id (detail fetch).
ALTER TABLE credentials ADD COLUMN last_used_at TEXT;
