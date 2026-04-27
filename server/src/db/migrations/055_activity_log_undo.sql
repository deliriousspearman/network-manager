ALTER TABLE activity_logs ADD COLUMN previous_state TEXT;
ALTER TABLE activity_logs ADD COLUMN can_undo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activity_logs ADD COLUMN undone_at TEXT;
CREATE INDEX IF NOT EXISTS idx_activity_logs_undoable ON activity_logs(can_undo, undone_at) WHERE can_undo = 1 AND undone_at IS NULL;
