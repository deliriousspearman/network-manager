import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import type { CreateProjectRequest, UpdateProjectRequest } from 'shared/types.js';

const router = Router();

router.get('/', (_req, res) => {
  const projects = db.prepare(
    `SELECT p.*,
      (SELECT COUNT(*) FROM devices WHERE project_id = p.id) as device_count,
      (SELECT COUNT(*) FROM subnets WHERE project_id = p.id) as subnet_count
     FROM projects p ORDER BY p.name`
  ).all();
  res.json(projects);
});

router.get('/:id', (req, res) => {
  const project = db.prepare(
    `SELECT p.*,
      (SELECT COUNT(*) FROM devices WHERE project_id = p.id) as device_count,
      (SELECT COUNT(*) FROM subnets WHERE project_id = p.id) as subnet_count
     FROM projects p WHERE p.id = ?`
  ).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.get('/:id/stats', (req, res) => {
  const id = req.params.id;
  const device_count = (db.prepare('SELECT COUNT(*) as c FROM devices WHERE project_id = ?').get(id) as any).c;
  const subnet_count = (db.prepare('SELECT COUNT(*) as c FROM subnets WHERE project_id = ?').get(id) as any).c;
  const credential_count = (db.prepare('SELECT COUNT(*) as c FROM credentials WHERE project_id = ?').get(id) as any).c;
  const favourite_count = (db.prepare("SELECT COUNT(*) as c FROM node_preferences WHERE project_id = ? AND json_extract(prefs, '$.favourite') = 1").get(id) as any).c;
  res.json({ device_count, subnet_count, credential_count, favourite_count });
});

router.get('/by-slug/:slug', (req, res) => {
  const project = db.prepare(
    `SELECT p.*,
      (SELECT COUNT(*) FROM devices WHERE project_id = p.id) as device_count,
      (SELECT COUNT(*) FROM subnets WHERE project_id = p.id) as subnet_count
     FROM projects p WHERE p.slug = ?`
  ).get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/', (req, res) => {
  const { name, slug, description } = req.body as CreateProjectRequest;
  if (!name?.trim() || !slug?.trim()) {
    res.status(400).json({ error: 'name and slug are required' });
    return;
  }
  const slugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
  if (!slugPattern.test(slug)) {
    res.status(400).json({ error: 'slug must be lowercase alphanumeric with dashes only' });
    return;
  }
  try {
    const result = db.prepare(
      'INSERT INTO projects (name, slug, description) VALUES (?, ?, ?)'
    ).run(name.trim(), slug.trim(), description?.trim() || null);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    logActivity({ action: 'created', resourceType: 'project', resourceId: result.lastInsertRowid as number, resourceName: name.trim() });
    res.status(201).json(project);
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'A project with this slug already exists' });
    } else {
      throw err;
    }
  }
});

router.put('/:id', (req, res) => {
  const { name, slug, description, about_title } = req.body as UpdateProjectRequest;
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const newName = name?.trim() || existing.name;
  const newSlug = slug?.trim() || existing.slug;
  const newDesc = description !== undefined ? (description || null) : existing.description;
  const newAboutTitle = about_title !== undefined ? (about_title?.trim() || null) : existing.about_title;

  if (newSlug !== existing.slug) {
    const slugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    if (!slugPattern.test(newSlug)) {
      res.status(400).json({ error: 'slug must be lowercase alphanumeric with dashes only' });
      return;
    }
  }

  try {
    db.prepare(
      `UPDATE projects SET name = ?, slug = ?, description = ?, about_title = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newName, newSlug, newDesc, newAboutTitle, req.params.id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    logActivity({ action: 'updated', resourceType: 'project', resourceId: Number(req.params.id), resourceName: newName });
    res.json(project);
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'A project with this slug already exists' });
    } else {
      throw err;
    }
  }
});

router.delete('/:id', (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as any).cnt;
  if (count <= 1) {
    res.status(400).json({ error: 'Cannot delete the last project' });
    return;
  }
  const projectId = req.params.id;
  const existing = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  // Manual cascade: delete all project-scoped data
  const deleteProject = db.transaction(() => {
    // Delete child data that references devices/subnets in this project
    db.prepare('DELETE FROM diagram_positions WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM subnet_diagram_positions WHERE subnet_id IN (SELECT id FROM subnets WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM device_ips WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM device_tags WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM device_subnets WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    // Delete parsed data for command_outputs in this project
    const outputIds = db.prepare('SELECT id FROM command_outputs WHERE project_id = ?').all(projectId) as { id: number }[];
    for (const { id } of outputIds) {
      for (const table of ['parsed_processes', 'parsed_connections', 'parsed_logins', 'parsed_interfaces', 'parsed_mounts', 'parsed_routes', 'parsed_services']) {
        db.prepare(`DELETE FROM ${table} WHERE command_output_id = ?`).run(id);
      }
    }
    // Delete top-level project-scoped tables
    db.prepare('DELETE FROM command_outputs WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM connections WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM credentials WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM highlight_rules WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM devices WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM subnets WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  });
  const projectName = (existing as any).name;
  deleteProject();
  logActivity({ action: 'deleted', resourceType: 'project', resourceId: Number(projectId), resourceName: projectName });
  res.status(204).send();
});

export default router;
