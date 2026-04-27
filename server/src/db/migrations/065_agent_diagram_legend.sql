CREATE TABLE IF NOT EXISTS agent_diagram_legend (
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    items       TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (project_id)
);
