import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? path.join(__dirname, '../../data');
export const BLOBS_ROOT = path.join(dataDir, 'blobs');

function extFromMime(mime: string | null | undefined): string {
  if (!mime) return 'bin';
  const m = mime.toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'application/pdf') return 'pdf';
  const parts = m.split('/');
  return parts[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
}

export type BlobTable =
  | 'device_type_icons'
  | 'device_icon_overrides'
  | 'agent_types'
  | 'diagram_images'
  | 'agent_diagram_images'
  | 'device_images'
  | 'device_attachments'
  | 'image_library'
  | 'projects';

export function blobDir(projectId: number | null, table: BlobTable): string {
  const projectSegment = projectId == null ? 'shared' : String(projectId);
  return path.join(BLOBS_ROOT, projectSegment, table);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeBlob(
  projectId: number | null,
  table: BlobTable,
  id: number,
  mimeType: string | null,
  buffer: Buffer,
): string {
  const dir = blobDir(projectId, table);
  ensureDir(dir);
  const ext = extFromMime(mimeType);
  const finalName = `${id}.${ext}`;
  const finalPath = path.join(dir, finalName);
  const tmpPath = path.join(dir, `.${finalName}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, finalPath);
  return path.relative(BLOBS_ROOT, finalPath);
}

export function readBlob(relativePath: string): Buffer {
  return fs.readFileSync(absolutePath(relativePath));
}

export function absolutePath(relativePath: string): string {
  const abs = path.resolve(BLOBS_ROOT, relativePath);
  if (!abs.startsWith(BLOBS_ROOT + path.sep) && abs !== BLOBS_ROOT) {
    throw new Error(`Blob path escapes storage root: ${relativePath}`);
  }
  return abs;
}

export function deleteBlob(relativePath: string | null | undefined): void {
  if (!relativePath) return;
  try {
    fs.unlinkSync(absolutePath(relativePath));
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

export function blobExists(relativePath: string | null | undefined): boolean {
  if (!relativePath) return false;
  try {
    return fs.existsSync(absolutePath(relativePath));
  } catch {
    return false;
  }
}
