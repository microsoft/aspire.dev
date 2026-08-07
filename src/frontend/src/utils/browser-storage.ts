export function getStoredPreference(key: string, fallback = ''): string {
  try {
    return typeof localStorage === 'undefined' ? fallback : localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setStoredPreference(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore blocked storage so preferences remain usable for the current page view.
  }
}
