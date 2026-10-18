import type { DisplaySegment } from './adaptiveLayout';

/** Prefer the browser API; fall back to CSS env() on implementations exposing only CSS. */
export function readDisplaySegments(browser: Window): DisplaySegment[] {
  const viewport = (browser as unknown as { viewport?: { segments?: DisplaySegment[] } }).viewport;
  if (viewport?.segments?.length) return Array.from(viewport.segments);
  const horizontal = [3, 2].find(count => browser.matchMedia(`(horizontal-viewport-segments: ${count})`).matches);
  const vertical = [3, 2].find(count => browser.matchMedia(`(vertical-viewport-segments: ${count})`).matches);
  const count = horizontal ?? vertical;
  if (!count || !browser.document.body) return [];
  const segments: DisplaySegment[] = [];
  for (let index = 0; index < count; index++) {
    const x = horizontal ? index : 0;
    const y = horizontal ? 0 : index;
    const probe = browser.document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position:fixed;pointer-events:none;visibility:hidden;left:env(viewport-segment-left ${x} ${y}, 0px);top:env(viewport-segment-top ${x} ${y}, 0px);width:env(viewport-segment-width ${x} ${y}, 0px);height:env(viewport-segment-height ${x} ${y}, 0px);`;
    browser.document.body.appendChild(probe);
    const { left, top, width, height } = probe.getBoundingClientRect();
    segments.push({ left, top, width, height });
    probe.remove();
  }
  return segments;
}
