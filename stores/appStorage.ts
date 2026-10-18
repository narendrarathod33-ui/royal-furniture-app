import { Platform } from 'react-native';

// Storage adapter for persisted stores.
//
// Web (and jest, via the localStorage shim in jest.setup.js) uses localStorage.
// Native persistence lands with react-native-mmkv in P5, when a native build
// exists to host it — swap the body of platformStorage() below; the sync
// get/set/remove contract stays the same.
//
// Note: the stores intentionally do NOT use zustand's persist middleware —
// its barrel import drags the devtools middleware into the web bundle, which
// contains `import.meta.env` and is a parse-time syntax error in Metro's
// classic-script web output. Persistence is wired manually per store instead.

interface AppStorage {
  get: (name: string) => string | null;
  set: (name: string, value: string) => void;
  remove: (name: string) => void;
}

function platformStorage(): AppStorage | null {
  if (Platform.OS !== 'web') return null; // native: MMKV adapter replaces this in P5
  if (typeof localStorage === 'undefined') return null; // non-browser edge
  return {
    get: (name) => localStorage.getItem(name),
    set: (name, value) => localStorage.setItem(name, value),
    remove: (name) => localStorage.removeItem(name),
  };
}

/** Reads and parses a JSON value written by saveJSON; null when absent or corrupt. */
export function loadJSON<T>(name: string): T | null {
  const storage = platformStorage();
  if (!storage) return null;
  try {
    const raw = storage.get(name);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null; // corrupt entry: start fresh rather than crash the store
  }
}

/** Serializes a user-owned slice of state; silently skips where no storage exists. */
export function saveJSON(name: string, value: unknown): void {
  const storage = platformStorage();
  if (!storage) return;
  try {
    storage.set(name, JSON.stringify(value));
  } catch {
    // Quota/private-mode failures must never take the app down with them.
  }
}

/** Removes a persisted value entirely (privacy delete keeps nothing behind). */
export function removeSaved(name: string): void {
  const storage = platformStorage();
  if (!storage) return;
  try {
    storage.remove(name);
  } catch {
    // ignore
  }
}
