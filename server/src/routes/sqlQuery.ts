import { Router } from 'express';
import readonlyDb from '../db/readonlyConnection.js';
import { SQL_QUERY_MAX_ROWS as MAX_ROWS } from '../config/limits.js';

const router = Router({ mergeParams: true });

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
    // Wrap the user query so SQLite stops fetching after MAX_ROWS+1 rather than
    // materializing the full result set just to slice it. The +1 lets us detect
    // truncation without a separate COUNT pass.
    const wrapped = `SELECT * FROM (${sql}) AS user_query LIMIT ${MAX_ROWS + 1}`;
    const stmt = readonlyDb.prepare(wrapped);
    const fetched = stmt.all({ projectId }) as Record<string, unknown>[];
    const truncated = fetched.length > MAX_ROWS;
    const rows = truncated ? fetched.slice(0, MAX_ROWS) : fetched;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    res.json({ columns, rows, rowCount: rows.length, truncated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    // Strip SQLite internals but keep the human-readable part
    const safeMsg = msg.includes(':') ? msg.split(':').pop()!.trim() : 'Query execution failed';
    res.status(400).json({ error: safeMsg || 'Query execution failed' });
  }
});

export default router;
