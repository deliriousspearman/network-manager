import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';
import { fetchTrash } from './trash';

// Restore the resource captured by a single activity_logs row. The server
// validates that the entry is still undoable and writes a new "undone" log
// on success.
export async function undoLogEntry(projectId: number, logId: number): Promise<{ success: true; resource_id: number | null; log_id: number }> {
  const res = await fetch(`${projectBase(projectId, 'undo')}/${logId}`, { method: 'POST' });
  if (!res.ok) await throwApiError(res, 'Failed to undo');
  return res.json();
}

// Undo the most recent N undoable trash entries (used by "Undo all" after a
// bulk delete). Returns the count actually restored — anything that 409s
// (already undone) or otherwise fails is silently skipped so the user gets
// a best-effort restore rather than a hard failure mid-loop.
export async function undoMany(projectId: number, count: number): Promise<{ restored: number; failed: number }> {
  if (count <= 0) return { restored: 0, failed: 0 };
  const { items } = await fetchTrash(projectId, undefined, count);
  let restored = 0;
  let failed = 0;
  // Iterate top-of-stack first so each undo doesn't invalidate the next id.
  for (const item of items) {
    try {
      await undoLogEntry(projectId, item.id);
      restored++;
    } catch {
      failed++;
    }
  }
  return { restored, failed };
}
