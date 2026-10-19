declare const process: { env: Record<string, string | undefined> };

/**
 * App skin switch. The default build is Version 1 (the shipped app). Building
 * with EXPO_PUBLIC_APP_SKIN=v2 produces Version 2 — the pitched prototype look
 * (pastel category tiles, icon-first product cards) over the same data layer.
 */
export const APP_SKIN: 'v1' | 'v2' = process.env.EXPO_PUBLIC_APP_SKIN === 'v2' ? 'v2' : 'v1';
