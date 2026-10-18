// Web storage adapter: localStorage. Metro resolves this file instead of
// appStoragePlatform.ts on web, so react-native-mmkv never enters the web
// bundle (and web keeps the exact same persistence keys).

import type { AppStorage } from './appStorage';

export function platformStorage(): AppStorage | null {
  if (typeof localStorage === 'undefined') return null; // non-browser edge
  return {
    get: (name) => localStorage.getItem(name),
    set: (name, value) => localStorage.setItem(name, value),
    remove: (name) => localStorage.removeItem(name),
  };
}
