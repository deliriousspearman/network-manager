/** Safe localStorage wrapper that handles private browsing and quota errors */
export function getStorage(key: string, fallback: string = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or private browsing — silently ignore
  }
}

export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Silently ignore
  }
}
