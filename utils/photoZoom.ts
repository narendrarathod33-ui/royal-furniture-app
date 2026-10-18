export type ZoomPoint = { x: number; y: number };
export type PhotoZoom = { scale: number; x: number; y: number };
export const INITIAL_ZOOM: PhotoZoom = { scale: 1, x: 0, y: 0 };
export function clampPhotoZoom(zoom: PhotoZoom, width: number, height: number): PhotoZoom {
  const scale = Math.max(1, Math.min(4, zoom.scale));
  const limitX = Math.max(0, width * (scale - 1) / 2);
  const limitY = Math.max(0, height * (scale - 1) / 2);
  return { scale, x: Math.max(-limitX, Math.min(limitX, zoom.x)), y: Math.max(-limitY, Math.min(limitY, zoom.y)) };
}
export function movePhotoZoom(start: PhotoZoom, before: ZoomPoint[], after: ZoomPoint[], width: number, height: number): PhotoZoom {
  if (!before.length || before.length !== after.length) return start;
  if (before.length === 1) return clampPhotoZoom({ ...start, x: start.x + after[0].x - before[0].x, y: start.y + after[0].y - before[0].y }, width, height);
  const distance = (points: ZoomPoint[]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const initialDistance = distance(before);
  if (initialDistance < 1) return start;
  const scale = Math.max(1, Math.min(4, start.scale * distance(after) / initialDistance));
  const ratio = scale / start.scale;
  const center = (points: ZoomPoint[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const origin = center(before), target = center(after);
  // Points are viewport-relative, keeping the pinched part of the image under the fingers.
  return clampPhotoZoom({ scale, x: target.x - width / 2 - (origin.x - width / 2 - start.x) * ratio, y: target.y - height / 2 - (origin.y - height / 2 - start.y) * ratio }, width, height);
}

/** A pinch or zoomed drag must never also become a gallery swipe. */
export function photoSwipeDirection(scale: number, pinched: boolean, start: ZoomPoint, end: ZoomPoint): -1 | 0 | 1 {
  if (pinched || scale > 1.01) return 0;
  const dx = end.x - start.x, dy = end.y - start.y;
  if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy) * 1.25) return 0;
  return dx < 0 ? 1 : -1;
}
