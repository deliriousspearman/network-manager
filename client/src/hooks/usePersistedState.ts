import { useEffect, useState } from 'react';
import { getStorage, setStorage } from '../utils/storage';

// JSON-backed useState that restores from localStorage on mount and writes
// on every change. Keyed strings should be unique per scope (e.g. include
// project id so different projects don't share filter state).
export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const raw = getStorage(key);
    if (!raw) return initial;
    try { return JSON.parse(raw) as T; } catch { return initial; }
  });
  useEffect(() => {
    setStorage(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}
