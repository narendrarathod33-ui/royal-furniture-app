import Constants from 'expo-constants';
import { Platform } from 'react-native';

const jsonCache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();
const preloaders = new Set<() => Promise<unknown>>();
const arabicPreloaders = new Set<() => Promise<unknown>>();

export function getWebBasePath(): string {
  const configured = (Constants?.expoConfig?.experiments?.baseUrl as string | undefined) || '';
  if (configured) return configured.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const scripts = document.querySelectorAll('script[src*="/_expo/static/js/web/"]');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i]?.getAttribute('src') || '';
      const idx = src.indexOf('/_expo/static/js/web/');
      if (idx > 0) {
        try {
          const parsed = new URL(src, window.location.origin);
          return parsed.pathname.slice(0, parsed.pathname.indexOf('/_expo/static/js/web/'));
        } catch {
          // ignore malformed script src
        }
      }
    }
  }
  return '';
}

export function notifyWebDataLoaded(): void {
  for (const listener of listeners) listener();
}

export function subscribeWebData(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerWebDataPreloader(loader: () => Promise<unknown>): void {
  preloaders.add(loader);
}

export function registerArabicDataPreloader(loader: () => Promise<unknown>): void {
  arabicPreloaders.add(loader);
}

export function preloadWebProductData(): Promise<unknown> {
  if (Platform.OS !== 'web' || typeof fetch !== 'function' || preloaders.size === 0) {
    return Promise.resolve();
  }
  return Promise.all(Array.from(preloaders, (fn) => fn().catch(() => undefined)));
}

export function preloadArabicCatalogNames(): Promise<unknown> {
  if (Platform.OS !== 'web' || typeof fetch !== 'function' || arabicPreloaders.size === 0) {
    return Promise.resolve();
  }
  return Promise.all(Array.from(arabicPreloaders, (fn) => fn().catch(() => undefined)));
}

export function getCachedWebJson<T>(fileName: string): T | undefined {
  return jsonCache.get(fileName) as T | undefined;
}

export function loadWebJson<T>(fileName: string, onLoaded?: (data: T) => void): Promise<T | undefined> {
  if (jsonCache.has(fileName)) {
    const cached = jsonCache.get(fileName) as T;
    return Promise.resolve(cached);
  }
  if (Platform.OS !== 'web' || typeof fetch !== 'function') {
    return Promise.resolve(undefined);
  }
  const existing = inflight.get(fileName) as Promise<T | undefined> | undefined;
  if (existing) return existing;

  const base = getWebBasePath();
  const url = `${base}/data/${fileName}`;
  const req = fetch(url, { credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return undefined;
      const data = (await res.json()) as T;
      jsonCache.set(fileName, data);
      onLoaded?.(data);
      notifyWebDataLoaded();
      return data;
    })
    .catch(() => undefined)
    .finally(() => {
      inflight.delete(fileName);
    });

  inflight.set(fileName, req);
  return req;
}
