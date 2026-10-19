/**
 * Loader for the harvested product-page records: the payload ships as a JSON
 * asset (`public/data/product-detail-records.json`) instead of living in the
 * JS bundle, so the ~1.3 MB app shell does not carry it. Regenerate the asset
 * with `node scripts/build-detail-records-json.cjs` after a harvest.
 *
 * Lives outside `app/` on purpose: expo-router's `require.context` bundles
 * every file under `app/` onto the web graph regardless of imports, which
 * would drag the payload back in.
 *
 * The `/royal-furniture-app` prefix matches the site's PAGES_BASE_PATH (same
 * convention as the deployed asset URLs). If the fetch fails — offline, or a
 * host that serves the app from a different base — the product page falls
 * back to its live-API / catalogue rendering paths.
 *
 * Native (iOS/Android) has no public/ asset space; see
 * `loadDetailStore.native.ts`, which lazily imports the bundled module.
 */
import { makeDetailStore, type DetailStore } from './productDetailDecode';

// Production serves the app under the site's PAGES_BASE_PATH; the Metro dev
// server and root-hosted copies (e.g. a locally unzipped build) serve public/
// assets from the origin root.
const DETAIL_RECORDS_URLS = [
  '/royal-furniture-app/data/product-detail-records.json',
  '/data/product-detail-records.json',
] as const;

let cached: Promise<DetailStore> | null = null;

type DetailPayload = { t: string[]; raw: Record<string, unknown> };

async function fetchPayload(): Promise<DetailPayload> {
  let lastError: unknown = new Error('no detail-records URL succeeded');
  for (const url of DETAIL_RECORDS_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`detail records HTTP ${res.status}`);
      return (await res.json()) as DetailPayload;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function loadDetailStore(): Promise<DetailStore> {
  if (!cached) {
    cached = fetchPayload().then(({ t, raw }) => makeDetailStore(t, raw as never));
  }
  return cached;
}
