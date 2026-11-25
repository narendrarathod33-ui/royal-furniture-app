import { loadWebJson, registerArabicDataPreloader } from './webDataLoader';

export const SCN_AR: Record<string, string> = {};
export const NAMES_AR: Record<string, string> = {};

let loaded = false;

export function ensureArabicNamesLoaded(): Promise<unknown> {
  if (loaded) return Promise.resolve();
  return loadWebJson<{ names?: Record<string, string>; scn?: Record<string, string> }>('catalog-names-ar.json', (data) => {
    if (data?.scn) Object.assign(SCN_AR, data.scn);
    if (data?.names) Object.assign(NAMES_AR, data.names);
    loaded = true;
  });
}

registerArabicDataPreloader(ensureArabicNamesLoaded);
