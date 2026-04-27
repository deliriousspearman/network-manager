import type { Database as BetterDatabase } from 'better-sqlite3';
import { writeBlob, type BlobTable } from '../../storage/blobStore.js';

type Spec = {
  table: BlobTable;
  projectIdCol: string | null;
};

const SPECS: Spec[] = [
  { table: 'device_type_icons', projectIdCol: 'project_id' },
  { table: 'device_icon_overrides', projectIdCol: 'project_id' },
  { table: 'diagram_images', projectIdCol: 'project_id' },
  { table: 'device_images', projectIdCol: 'project_id' },
  { table: 'device_attachments', projectIdCol: 'project_id' },
  { table: 'image_library', projectIdCol: 'project_id' },
];

type BlobRow = {
  id: number;
  project_id: number | null;
  mime_type: string | null;
  data: string | null;
};

export function migrateBlobsToDisk(db: BetterDatabase): void {
  for (const spec of SPECS) {
    const { table, projectIdCol } = spec;
    const selectSql = `SELECT id, ${projectIdCol ?? 'NULL AS project_id'}, mime_type, data FROM ${table} WHERE data IS NOT NULL AND (file_path IS NULL OR file_path = '')`;
    const rows = db.prepare(selectSql).all() as BlobRow[];
    if (rows.length === 0) continue;

    const updateStmt = db.prepare(`UPDATE ${table} SET file_path = ?, data = NULL WHERE id = ?`);
    const runOne = (row: BlobRow) => {
      const buf = Buffer.from(row.data!, 'base64');
      const relPath = writeBlob(row.project_id, table, row.id, row.mime_type, buf);
      updateStmt.run(relPath, row.id);
    };

    const tx = db.transaction((batch: BlobRow[]) => {
      for (const r of batch) runOne(r);
    });
    tx(rows);
    console.log(`[blob-migrate] ${table}: moved ${rows.length} blob(s) to disk`);
  }
}
