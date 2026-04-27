-- Add updated_at columns to tables that need optimistic-locking protection.
-- The UPDATE statements in the corresponding routes bump updated_at to
-- datetime('now'), and PUT/PATCH handlers compare the client-supplied
-- updated_at against the row's current value to detect concurrent edits.
--
-- SQLite disallows non-constant defaults on ALTER TABLE ADD COLUMN, so the
-- new columns default to epoch and existing rows are backfilled to the
-- current time below.

ALTER TABLE connections      ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE highlight_rules  ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE router_configs   ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
ALTER TABLE command_outputs  ADD COLUMN updated_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';

UPDATE connections      SET updated_at = datetime('now');
UPDATE highlight_rules  SET updated_at = datetime('now');
UPDATE router_configs   SET updated_at = datetime('now');
UPDATE command_outputs  SET updated_at = datetime('now');
