-- Per-credential append-only password history. Captures (a) prior values
-- when a credential's password / file is rotated, and (b) manually-recorded
-- "tried this and it didn't work" entries so teammates don't waste effort
-- re-trying known-bad values.
--
-- file_data is BLOB to match credentials.file_data; status is constrained
-- to two cases: 'previous' (auto-snapshotted on update) and 'invalid'
-- (user-recorded). The triple-NULL CHECK rejects entries with no useful
-- payload at all.

CREATE TABLE credential_password_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id INTEGER NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  password TEXT,
  file_name TEXT,
  file_data BLOB,
  status TEXT NOT NULL CHECK(status IN ('previous','invalid')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (password IS NOT NULL OR file_name IS NOT NULL OR note IS NOT NULL)
);

CREATE INDEX idx_cred_history_credential ON credential_password_history(credential_id, created_at DESC);
CREATE INDEX idx_cred_history_project ON credential_password_history(project_id, created_at DESC);
