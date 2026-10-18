/** Pointer events provide real coordinates for touch, pen and mouse alike.
 * Do not preventDefault: CSS pan-y leaves vertical scrolling/browser pinch intact.
 */
export function attachGalleryPointerNavigation(node: HTMLElement, navigate: (direction: -1 | 1) => void, openPhoto: () => void): () => void {
  const pointers = new Set<number>();
  let start: { id: number; x: number; y: number; moved: number } | null = null;
  let multiple = false;
  const down = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.add(event.pointerId);
    if (pointers.size > 1 || event.isPrimary === false) { multiple = true; start = null; return; }
    start = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
    try { node.setPointerCapture?.(event.pointerId); } catch { /* A cancelled pointer cannot be captured. */ }
  };
  const move = (event: PointerEvent) => {
    if (start?.id === event.pointerId) start.moved = Math.max(start.moved, Math.hypot(event.clientX - start.x, event.clientY - start.y));
  };
  const up = (event: PointerEvent) => {
    const gesture = start;
    pointers.delete(event.pointerId);
    start = null;
    const blocked = multiple;
    if (!pointers.size) multiple = false;
    if (!gesture || gesture.id !== event.pointerId || blocked) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25) navigate(dx < 0 ? 1 : -1);
    else if (Math.hypot(dx, dy) < 10 && gesture.moved < 10) openPhoto();
  };
  const cancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    start = null;
    if (!pointers.size) multiple = false;
  };
  const handlers = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, lostpointercapture: cancel };
  for (const [type, handler] of Object.entries(handlers)) node.addEventListener(type, handler as EventListener, { passive: true });
  return () => {
    for (const [type, handler] of Object.entries(handlers)) node.removeEventListener(type, handler as EventListener);
    start = null; pointers.clear(); multiple = false;
  };
}
