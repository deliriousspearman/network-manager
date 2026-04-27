import Database, { type Database as BetterDatabase } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { migrateBlobsToDisk } from './migrations/054_blob_migrate.js';
import { seedDefaultLibraryImages } from './seedDefaultLibraryImages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR override lets tests point the server at a fresh temp directory
// so each test process gets its own isolated DB + blob storage.
const dataDir = process.env.DATA_DIR ?? path.join(__dirname, '../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: BetterDatabase = new Database(path.join(dataDir, 'network.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Track which migrations have run so each executes exactly once
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);

const migrationsDir = path.join(__dirname, 'migrations');
if (fs.existsSync(migrationsDir)) {
  const applied = new Set(
    (db.prepare('SELECT filename FROM schema_migrations').all() as { filename: string }[]).map(r => r.filename)
  );

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file);
  }
}

// Idempotent: moves any remaining base64-in-DB blobs to disk. Safe to run on every startup.
migrateBlobsToDisk(db);

// Idempotent: ensure each project has the bundled default Router/Cloud images
// in its image library so the gallery is never empty out of the box.
seedDefaultLibraryImages(db);

export default db;
