// Unwrap a mutation/fetch error into a plain string for inline display.
// The server returns { error: "..." } JSON for all 4xx responses; the fetch
// wrappers throw Errors whose message is that string. Unknown shapes fall
// through to a generic fallback.
export function formErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  return 'An unexpected error occurred. Please try again.';
}
