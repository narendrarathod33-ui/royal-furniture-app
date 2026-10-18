import { loadJSON, removeSaved, saveJSON } from '../stores/appStorage';

// P5: the storage adapter underneath the zustand stores. The jest-expo/ios
// environment resolves the native platform file; react-native-mmkv has no
// native side here, so the adapter must fall back to its in-memory storage
// instead of crashing module load — exactly what a device without the
// EAS build would need. (The web/localStorage and real-MMKV paths are
// covered by the Playwright smoke and the EAS build respectively.)

describe('appStorage adapter (native env → in-memory fallback)', () => {
  beforeEach(() => {
    removeSaved('rf-adapter-test');
    removeSaved('rf-adapter-test-2');
  });

  it('round-trips JSON values', () => {
    saveJSON('rf-adapter-test', { cart: [{ id: 'nimbus' }], saved: ['a', 'b'] });
    expect(loadJSON('rf-adapter-test')).toEqual({ cart: [{ id: 'nimbus' }], saved: ['a', 'b'] });
  });

  it('keeps keys isolated and drops removed values', () => {
    saveJSON('rf-adapter-test', { a: 1 });
    saveJSON('rf-adapter-test-2', { b: 2 });
    removeSaved('rf-adapter-test');
    expect(loadJSON('rf-adapter-test')).toBeNull();
    expect(loadJSON('rf-adapter-test-2')).toEqual({ b: 2 });
  });

  it('reads unknown keys as null', () => {
    expect(loadJSON('rf-adapter-unknown-key')).toBeNull();
  });
});
