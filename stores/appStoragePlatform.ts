// Native storage adapter: react-native-mmkv. Resolved by Metro/jest on iOS
// and Android only (the .web sibling never reaches native bundles, and this
// file never reaches the web bundle).
//
// The require is lazy and guarded: in a real EAS build the module autolinks
// and MMKV persists across launches; in environments without the native
// side (jest, Expo Go) instantiation throws and the core falls back to its
// in-memory adapter. Either way this file must never break module load —
// the stores hydrate right after importing it.

declare const require: (id: 'react-native-mmkv') => typeof import('react-native-mmkv');

import type { AppStorage } from './appStorage';

export function platformStorage(): AppStorage | null {
  try {
    const { createMMKV } = require('react-native-mmkv');
    const mmkv = createMMKV({ id: 'rf-app-storage' });
    return {
      get: (name) => mmkv.getString(name) ?? null,
      set: (name, value) => mmkv.set(name, value),
      remove: (name) => {
        mmkv.remove(name);
      },
    };
  } catch {
    return null; // no native module here — session-only persistence
  }
}
