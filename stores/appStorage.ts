// Storage adapter for persisted stores.
//
// Split by platform (Metro/jest resolve appStoragePlatform.web.ts on web,
// appStoragePlatform.ts on native):
//   - web  → localStorage
//   - native → react-native-mmkv (P5), falling back to in-memory when the
//     native module is absent (jest, Expo Go) so the app degrades to
//     session-only persistence instead of crashing.
//
// Note: the stores intentionally do NOT use zustand's persist middleware —
// its barrel import drags the devtools middleware into the web bundle, which
// contains `import.meta.env` and is a parse-time syntax error in Metro's
// classic-script web output. Persistence is wired manually per store instead.

import { platformStorage } from './appStoragePlatform';

/** The tiny contract every platform adapter fulfils. */
export interface AppStorage {
  get: (name: string) => string | null;
  set: (name: string, value: string) => void;
  remove: (name: string) => void;
}

const memory = new Map<string, string>();

/** Session-only fallback: never persistent, but keeps the app working where
 * no real storage exists (jest, Expo Go before the EAS build). */
function memoryStorage(): AppStorage {
  return {
    get: (name) => memory.get(name) ?? null,
    set: (name, value) => {
      memory.set(name, value);
    },
    remove: (name) => {
      memory.delete(name);
    },
  };
}

let cached: AppStorage | null = null;

function storage(): AppStorage {
  if (!cached) cached = platformStorage() ?? memoryStorage();
  return cached;
}

/** Reads and parses a JSON value written by saveJSON; null when absent or corrupt. */
export function loadJSON<T>(name: string): T | null {
  try {
    const raw = storage().get(name);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null; // corrupt entry: start fresh rather than crash the store
  }
}

/** Serializes a user-owned slice of state; silently skips where no storage exists. */
export function saveJSON(name: string, value: unknown): void {
  try {
    storage().set(name, JSON.stringify(value));
  } catch {
    // Quota/private-mode failures must never take the app down with them.
  }
}

/** Removes a persisted value entirely (privacy delete keeps nothing behind). */
export function removeSaved(name: string): void {
  try {
    storage().remove(name);
  } catch {
    // ignore
  }
}
