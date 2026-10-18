/** Logical image index for a looping gallery, safe for empty/single galleries. */
export function wrapSlideIndex(index: number, count: number): number {
  return count > 1 ? ((index % count) + count) % count : 0;
}

/** Physical position in [last clone, ...images, first clone]. */
export function loopSlidePosition(index: number, count: number): number {
  if (count < 2) return 0;
  if (index === -1) return 0;
  if (index === count) return count + 1;
  return wrapSlideIndex(index, count) + 1;
}

/** Move a settled clone to its identical real image without animation. */
export function settledSlidePosition(position: number, count: number): number {
  if (count < 2) return 0;
  if (position <= 0) return count;
  if (position >= count + 1) return 1;
  return position;
}
