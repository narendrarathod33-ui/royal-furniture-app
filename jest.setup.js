// Shared test environment for the RNTL suites.
//
// - localStorage: the app guards every access, but a real shim exercises the
//   web purge path in HomeScreen.
// - fetch: components fetch official details / payment config on demand; the
//   default is a clean 4xx so components take their documented offline paths.
//   Individual tests override with their own jest.spyOn/mockImplementation.
if (typeof global.localStorage === 'undefined') {
  const store = new Map();
  global.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  global.window = global.window || {};
  global.window.localStorage = global.localStorage;
}

global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404, headers: { get: () => null } }));

// Silence the native-driver warning spam from Animated in tests.
jest.spyOn(console, 'warn').mockImplementation((...args) => {
  if (String(args[0]).includes('useNativeDriver')) return;
  console.log(...args);
});
