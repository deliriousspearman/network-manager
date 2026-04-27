import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Database as BetterDatabase } from 'better-sqlite3';
import { writeBlob } from '../storage/blobStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULTS_DIR = path.join(__dirname, '../assets/default-images');

const DEFAULTS: { filename: string; mime_type: string }[] = [
  { filename: 'router.svg', mime_type: 'image/svg+xml' },
  { filename: 'cloud.svg', mime_type: 'image/svg+xml' },
];

function loadDefault(filename: string): Buffer {
  return fs.readFileSync(path.join(DEFAULTS_DIR, filename));
}

export function seedDefaultLibraryImagesForProject(db: BetterDatabase, projectId: number): void {
  const existsStmt = db.prepare(
    'SELECT 1 FROM image_library WHERE project_id = ? AND filename = ? LIMIT 1'
  );
  // The legacy `data` column is still NOT NULL (blob bytes used to live there
  // before migration 054 moved them to disk). Insert an empty string to
  // satisfy the constraint; the real bytes go to disk via writeBlob below.
  const insertStmt = db.prepare(
    `INSERT INTO image_library (project_id, filename, mime_type, size, data)
     VALUES (?, ?, ?, ?, '')`
  );
  const updatePathStmt = db.prepare('UPDATE image_library SET file_path = ? WHERE id = ?');

  for (const def of DEFAULTS) {
    if (existsStmt.get(projectId, def.filename)) continue;
    let bytes: Buffer;
    try {
      bytes = loadDefault(def.filename);
    } catch (e) {
      console.warn(`[seed-defaults] missing bundled image ${def.filename}, skipping`);
      continue;
    }
    const result = insertStmt.run(projectId, def.filename, def.mime_type, bytes.length);
    const id = Number(result.lastInsertRowid);
    const relPath = writeBlob(projectId, 'image_library', id, def.mime_type, bytes);
    updatePathStmt.run(relPath, id);
  }
}

export function seedDefaultLibraryImages(db: BetterDatabase): void {
  const projects = db.prepare('SELECT id FROM projects').all() as { id: number }[];
  for (const p of projects) {
    seedDefaultLibraryImagesForProject(db, p.id);
  }
}
