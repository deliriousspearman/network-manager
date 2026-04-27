/** Thrown on a 409 response — typically a concurrent-edit conflict. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/** Extract a meaningful error message from a failed fetch response */
export async function throwApiError(res: Response, fallback: string): Promise<never> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error || body?.message || '';
  } catch {
    // Response wasn't JSON
  }
  const status = res.status;
  if (status === 409) throw new ConflictError(detail || 'This entry was modified by another session. Please refresh and try again.');
  if (detail) throw new Error(`${fallback}: ${detail}`);
  if (status === 404) throw new Error(`${fallback}: not found`);
  if (status === 400) throw new Error(`${fallback}: invalid request`);
  if (status >= 500) throw new Error(`${fallback}: server error (${status})`);
  throw new Error(`${fallback} (${status})`);
}
