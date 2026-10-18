export type DisplaySegment = { left: number; top: number; width: number; height: number };
export const MAX_WORKSPACE = 1360;

export function layoutMode(width: number) {
  return width < 600 ? 'compact' : width < 840 ? 'medium' : width < 1200 ? 'expanded' : 'wide';
}

/** Fit complete cards, including gaps. Never infer a device type from width. */
export function gridMetrics(width: number, fontScale = 1) {
  const gap = width < 600 ? 12 : 20;
  const minimum = (width < 600 ? 140 : 210) * Math.max(1, fontScale);
  const columns = Math.max(1, Math.min(width < 600 ? 2 : 5, Math.floor((width + gap) / (minimum + gap))));
  return { columns, gap, cardWidth: Math.max(0, (width - gap * (columns - 1)) / columns) };
}

/** Browser segment data is optional and untrusted; reject malformed/offscreen rectangles. */
export function usableSegment(segments: readonly DisplaySegment[], width: number, height: number): DisplaySegment | undefined {
  const valid = segments.filter(s => [s.left, s.top, s.width, s.height].every(Number.isFinite)
    && s.left >= 0 && s.top >= 0 && s.width > 0 && s.height > 0
    && s.left + s.width <= width + 1 && s.top + s.height <= height + 1);
  if (valid.length < 2) return undefined;
  // Conservatively use one complete segment. Never put controls across a hinge.
  return [...valid].sort((a, b) => b.width * b.height - a.width * a.height || a.left - b.left || a.top - b.top)[0];
}
