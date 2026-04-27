// Lightweight runtime validation for API responses.
//
// Goal: catch silent shape drift between server and client (e.g. a server-side
// rename that strips a field) at the API boundary instead of crashing deep in
// a component. Two modes:
//
//  - Critical (default): throw with the wrapper name + reason. Use for
//    structural fields the caller will dereference unconditionally
//    (e.g. items array of a paged response).
//
//  - Soft (validateSoft): log a console.warn in dev, pass through in prod.
//    Use for fields whose absence merely produces a degraded experience
//    (e.g. a missing optional field).
//
// We deliberately don't validate every field — that's what zod is for, and
// we don't want to install it. The point is to fail fast on obvious shape
// errors with a clear message, not to be a full schema validator.

const isDev = (() => {
  try { return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV); }
  catch { return false; }
})();

export const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';
export const isNum = (v: unknown): v is number => typeof v === 'number';
export const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

// Run `check` against `value`. If it returns an error string, throw with the
// wrapper label so the developer sees `fetchDevicesPaged: items not an array`
// in the network panel instead of an unrelated TypeError elsewhere.
export function validate<T>(value: unknown, check: (v: unknown) => string | null, label: string): T {
  const err = check(value);
  if (err) throw new Error(`${label}: ${err}`);
  return value as T;
}

// Soft variant: warn in dev, pass through. For optional / non-load-bearing fields.
export function validateSoft<T>(value: unknown, check: (v: unknown) => string | null, label: string): T {
  const err = check(value);
  if (err && isDev) {
    // Do not throw — production may have legitimately new fields the client
    // doesn't know about yet. Surface in console so devs notice during testing.
    // eslint-disable-next-line no-console
    console.warn(`[api] ${label}: ${err}`, value);
  }
  return value as T;
}

// Common: paged response wrapper. Used by devices, subnets, credentials,
// agents, timeline. We validate the envelope; per-row shape is the caller's
// concern (it varies per resource).
export function pagedEnvelope(v: unknown): string | null {
  if (!isObj(v)) return 'expected object';
  if (!Array.isArray(v.items)) return 'missing items array';
  if (!isNum(v.total)) return 'total not a number';
  if (!isNum(v.page)) return 'page not a number';
  if (!isNum(v.limit)) return 'limit not a number';
  return null;
}
