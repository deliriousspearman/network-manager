import { Router } from 'express';
import readonlyDb from '../db/readonlyConnection.js';

const router = Router({ mergeParams: true });

const MAX_ROWS = 1000;

const DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|REPLACE|GRANT|REVOKE|VACUUM)\b/i;

function stripComments(sql: string): string {
  // Remove single-line comments
  let result = sql.replace(/--[^\n]*/g, '');
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result;
}

function hasSemicolonOutsideStrings(sql: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      // Handle escaped single quotes ('')
      if (inSingle && sql[i + 1] === "'") { i++; continue; }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ';' && !inSingle && !inDouble) {
      return true;
    }
  }
  return false;
}

function validateQuery(sql: string): string | null {
  if (!sql || !sql.trim()) {
    return 'Query cannot be empty';
  }

  const stripped = stripComments(sql).trim();

  if (!stripped) {
    return 'Query cannot be empty';
  }

  if (!/^SELECT\b/i.test(stripped)) {
    return 'Only SELECT queries are allowed';
  }

  if (hasSemicolonOutsideStrings(stripped)) {
    return 'Multiple statements are not allowed';
  }

  if (DANGEROUS_KEYWORDS.test(stripped)) {
    return 'Query contains disallowed keywords';
  }

  return null;
}

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { sql } = req.body as { sql?: string };

  if (!sql || typeof sql !== 'string') {
    res.status(400).json({ error: 'sql field is required' });
    return;
  }

  const validationError = validateQuery(sql);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const stmt = readonlyDb.prepare(sql);
    const allRows = stmt.all({ projectId });
    const truncated = allRows.length > MAX_ROWS;
    const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows;
    const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

    res.json({ columns, rows, rowCount: rows.length, truncated });
  } catch (err: any) {
    const msg = err.message || '';
    // Strip SQLite internals but keep the human-readable part
    const safeMsg = msg.includes(':') ? msg.split(':').pop()!.trim() : 'Query execution failed';
    res.status(400).json({ error: safeMsg || 'Query execution failed' });
  }
});

export default router;
