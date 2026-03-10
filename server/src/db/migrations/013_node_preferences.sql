CREATE TABLE IF NOT EXISTS node_preferences (
    node_id     TEXT NOT NULL,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    prefs       TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (node_id, project_id)
);
