/**
 * Native loader for the harvested product-page records: Metro cannot
 * code-split on native, so the payload stays bundled in
 * `productDetailRecords.ts` and is `import()`ed lazily so parse cost waits
 * until the product page first needs it.
 */
import type { DetailStore } from './productDetailDecode';

export async function loadDetailStore(): Promise<DetailStore> {
  const m = await import('./productDetailRecords');
  return m.detailStore;
}
