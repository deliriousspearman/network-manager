import { useEffect, useState } from 'react';

/**
 * Returns a version of `value` that only updates after `delayMs` have passed
 * without another change. Use for query keys and other expensive-to-recompute
 * derivations driven by fast-changing inputs like search fields.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
