import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { sanitizeRichText, stripHtml } from '../sanitizeHtml.js';
import { seedDefaultLibraryImagesForProject } from '../db/seedDefaultLibraryImages.js';
import { writeBlob, absolutePath, deleteBlob } from '../storage/blobStore.js';
import { sanitizeFilename } from '../validation.js';
import { PROFILE_IMAGE_MAX_BYTES as MAX_IMAGE_SIZE } from '../config/limits.js';
import type { CreateProjectRequest, UpdateProjectRequest } from 'shared/types.js';

interface ProjectRow {
  id: number;
  name: string;
  slug: string;
  short_name: string;
  description: string | null;
  about_title: string | null;
  image_mime_type: string | null;
  image_file_path: string | null;
  created_at: string;
  updated_at: string;
}

// Columns safe to expose to clients. image_file_path is internal — clients fetch
// the binary via GET /:id/image.
const PROJECT_COLUMNS =
  'p.id, p.name, p.slug, p.short_name, p.description, p.about_title, p.image_mime_type, p.created_at, p.updated_at';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

const router = Router();

router.get('/', (_req, res) => {
  const projects = db.prepare(
    `SELECT ${PROJECT_COLUMNS},
      (SELECT COUNT(*) FROM devices WHERE project_id = p.id) as device_count,
      (SELECT COUNT(*) FROM subnets WHERE project_id = p.id) as subnet_count
     FROM projects p ORDER BY p.name`
  ).all();
  res.json(projects);
});

router.get('/:id', (req, res) => {
  const project = db.prepare(
    `SELECT ${PROJECT_COLUMNS},
      (SELECT COUNT(*) FROM devices WHERE project_id = p.id) as device_count,
      (SELECT COUNT(*) FROM subnets WHERE project_id = p.id) as subnet_count
     FROM projects p WHERE p.id = ?`
  ).get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.get('/:id/stats', (req, res) => {
  const id = req.params.id;
  const device_count = (db.prepare('SELECT COUNT(*) as c FROM devices WHERE project_id = ?').get(id) as { c: number }).c;
  const subnet_count = (db.prepare('SELECT COUNT(*) as c FROM subnets WHERE project_id = ?').get(id) as { c: number }).c;
  const credential_count = (db.prepare('SELECT COUNT(*) as c FROM credentials WHERE project_id = ?').get(id) as { c: number }).c;
  const favourite_count = (db.prepare("SELECT COUNT(*) as c FROM node_preferences WHERE project_id = ? AND json_extract(prefs, '$.favourite') = 1").get(id) as { c: number }).c;
  res.json({ device_count, subnet_count, credential_count, favourite_count });
});

router.get('/by-slug/:slug', (req, res) => {
  const project = db.prepare(
    `SELECT ${PROJECT_COLUMNS},
      (SELECT COUNT(*) FROM devices WHERE project_id = p.id) as device_count,
      (SELECT COUNT(*) FROM subnets WHERE project_id = p.id) as subnet_count
     FROM projects p WHERE p.slug = ?`
  ).get(req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/', (req, res) => {
  const { name, slug, short_name, description } = req.body as CreateProjectRequest;
  if (!name?.trim() || !slug?.trim()) {
    res.status(400).json({ error: 'name and slug are required' });
    return;
  }
  if (name.trim().length > 200) {
    res.status(400).json({ error: 'name must be at most 200 characters' });
    return;
  }
  if (slug.trim().length > 100) {
    res.status(400).json({ error: 'slug must be at most 100 characters' });
    return;
  }
  if (description && description.length > 50000) {
    res.status(400).json({ error: 'description must be at most 50000 characters' });
    return;
  }
  const trimmedShortName = short_name?.trim() || name.trim().substring(0, 2).toUpperCase();
  if (trimmedShortName.length > 2) {
    res.status(400).json({ error: 'short_name must be at most 2 characters' });
    return;
  }
  const slugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
  if (!slugPattern.test(slug)) {
    res.status(400).json({ error: 'slug must be lowercase alphanumeric with dashes only' });
    return;
  }
  // description is user-authored HTML rendered via dangerouslySetInnerHTML on the client.
  // Sanitize server-side — client DOMPurify can be bypassed by calling the API directly.
  const cleanDescription = description ? sanitizeRichText(description).trim() || null : null;
  try {
    const result = db.prepare(
      'INSERT INTO projects (name, slug, short_name, description) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), slug.trim(), trimmedShortName, cleanDescription);
    const projectId = result.lastInsertRowid as number;
    seedDefaultLibraryImagesForProject(db, projectId);
    const project = db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`).get(projectId);
    logActivity({ action: 'created', resourceType: 'project', resourceId: projectId, resourceName: name.trim() });
    res.status(201).json(project);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'A project with this slug already exists' });
    } else {
      throw err;
    }
  }
});

router.put('/:id', (req, res) => {
  const { name, slug, short_name, description, about_title } = req.body as UpdateProjectRequest;
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as ProjectRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const newName = name?.trim() || existing.name;
  const newSlug = slug?.trim() || existing.slug;
  const newShortName = short_name !== undefined ? (short_name.trim() || existing.short_name) : existing.short_name;
  // description is rich HTML — sanitize; about_title is plain text in the UI so strip all HTML.
  const newDesc = description !== undefined
    ? (description ? sanitizeRichText(description) || null : null)
    : existing.description;
  const newAboutTitle = about_title !== undefined
    ? (about_title ? stripHtml(about_title).trim() || null : null)
    : existing.about_title;

  if (newShortName.length > 2) {
    res.status(400).json({ error: 'short_name must be at most 2 characters' });
    return;
  }

  if (newDesc != null && newDesc.length > 50000) {
    res.status(400).json({ error: 'description must be at most 50000 characters' });
    return;
  }
  if (newAboutTitle != null && newAboutTitle.length > 200) {
    res.status(400).json({ error: 'about_title must be at most 200 characters' });
    return;
  }

  if (newSlug !== existing.slug) {
    const slugPattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
    if (!slugPattern.test(newSlug)) {
      res.status(400).json({ error: 'slug must be lowercase alphanumeric with dashes only' });
      return;
    }
  }

  try {
    db.prepare(
      `UPDATE projects SET name = ?, slug = ?, short_name = ?, description = ?, about_title = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newName, newSlug, newShortName, newDesc, newAboutTitle, req.params.id);
    const project = db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`).get(req.params.id);
    logActivity({ action: 'updated', resourceType: 'project', resourceId: Number(req.params.id), resourceName: newName });
    res.json(project);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'A project with this slug already exists' });
    } else {
      throw err;
    }
  }
});

router.delete('/:id', (req, res) => {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number }).cnt;
  if (count <= 1) {
    res.status(400).json({ error: 'Cannot delete the last project' });
    return;
  }
  const projectId = req.params.id;
  const existing = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId) as { id: number; name: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  // Manual cascade: delete all project-scoped data
  const deleteProject = db.transaction(() => {
    // Delete child data that references devices/subnets in this project
    db.prepare('DELETE FROM diagram_positions WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM subnet_diagram_positions WHERE subnet_id IN (SELECT id FROM subnets WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM device_ips WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM device_tags WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    db.prepare('DELETE FROM device_subnets WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
    // Delete command_outputs (parsed_* tables cascade via FK ON DELETE CASCADE)
    db.prepare('DELETE FROM command_outputs WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM connections WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM credentials WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM highlight_rules WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM devices WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM subnets WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  });
  const projectName = existing.name;
  deleteProject();
  logActivity({ action: 'deleted', resourceType: 'project', resourceId: Number(projectId), resourceName: projectName });
  res.status(204).send();
});

router.get('/:id/image', (req, res) => {
  const row = db.prepare(
    'SELECT image_mime_type, image_file_path FROM projects WHERE id = ?'
  ).get(req.params.id) as { image_mime_type: string | null; image_file_path: string | null } | undefined;
  if (!row || !row.image_file_path || !row.image_mime_type) {
    return res.status(404).json({ error: 'Project image not found' });
  }
  res.setHeader('Content-Type', row.image_mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(absolutePath(row.image_file_path));
});

router.post('/:id/image', (req, res) => {
  const projectId = Number(req.params.id);
  const { filename, mime_type, data } = req.body as { filename?: string; mime_type?: string; data?: string };

  if (!filename || !mime_type || !data) {
    return res.status(400).json({ error: 'filename, mime_type and data are required' });
  }
  if (!ALLOWED_IMAGE_MIMES.includes(mime_type)) {
    return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}` });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_IMAGE_SIZE) {
    return res.status(400).json({ error: 'Image exceeds 5 MB limit' });
  }

  const existing = db.prepare('SELECT id, image_file_path FROM projects WHERE id = ?').get(projectId) as
    | { id: number; image_file_path: string | null }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  // Remove any previous blob so changing MIME types (e.g. png → jpg) doesn't leave stale files
  deleteBlob(existing.image_file_path);

  sanitizeFilename(filename); // validate filename format; actual name is derived from id
  const relPath = writeBlob(projectId, 'projects', projectId, mime_type, decoded);
  db.prepare(
    `UPDATE projects SET image_mime_type = ?, image_file_path = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(mime_type, relPath, projectId);

  const project = db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`).get(projectId);
  logActivity({ action: 'updated', resourceType: 'project', resourceId: projectId, resourceName: (project as { name?: string } | undefined)?.name ?? '' });
  res.status(200).json(project);
});

router.delete('/:id/image', (req, res) => {
  const projectId = Number(req.params.id);
  const existing = db.prepare(
    'SELECT id, name, image_file_path FROM projects WHERE id = ?'
  ).get(projectId) as { id: number; name: string; image_file_path: string | null } | undefined;
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  deleteBlob(existing.image_file_path);
  db.prepare(
    `UPDATE projects SET image_mime_type = NULL, image_file_path = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(projectId);

  const project = db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects p WHERE p.id = ?`).get(projectId);
  logActivity({ action: 'updated', resourceType: 'project', resourceId: projectId, resourceName: existing.name });
  res.status(200).json(project);
});

export default router;
