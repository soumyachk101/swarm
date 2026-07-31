/**
 * Camera maths for the Flow canvas. Pure: no React, no DOM, so the parts
 * that are easy to get subtly wrong (zooming about a point, fitting content)
 * are testable on their own.
 *
 * Two coordinate spaces:
 *   world  - where nodes live. Never changes when you pan or zoom.
 *   screen - pixels in the viewport.
 *
 * screen = (world + camera.offset) * zoom
 */

export interface Camera {
  /** World-space point currently at the viewport's top-left, negated. */
  x: number;
  y: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export function screenToWorld(cam: Camera, sx: number, sy: number) {
  return { x: sx / cam.zoom - cam.x, y: sy / cam.zoom - cam.y };
}

export function worldToScreen(cam: Camera, wx: number, wy: number) {
  return { x: (wx + cam.x) * cam.zoom, y: (wy + cam.y) * cam.zoom };
}

/**
 * Zoom about a fixed screen point, so the world point under the cursor stays
 * under the cursor. Zooming about the origin instead is the single most common
 * canvas bug: content slides away from the pointer as you scroll.
 */
export function zoomAbout(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  if (zoom === cam.zoom) return cam;
  const before = screenToWorld(cam, sx, sy);
  const after = screenToWorld({ ...cam, zoom }, sx, sy);
  return { zoom, x: cam.x + (after.x - before.x), y: cam.y + (after.y - before.y) };
}

/** Pan by a screen-space delta (a drag), converted to world units. */
export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x + dxScreen / cam.zoom, y: cam.y + dyScreen / cam.zoom };
}

export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** A camera that frames every node inside the viewport, with breathing room. */
export function fitTo(rects: Rect[], viewW: number, viewH: number, pad = 80): Camera {
  const b = boundsOf(rects);
  if (!b || viewW <= 0 || viewH <= 0) return DEFAULT_CAMERA;
  const zoom = clampZoom(Math.min((viewW - pad * 2) / Math.max(b.w, 1), (viewH - pad * 2) / Math.max(b.h, 1)));
  // Centre the bounds: the world point at the middle of the bounds should land
  // at the middle of the viewport.
  return {
    zoom,
    x: viewW / (2 * zoom) - (b.x + b.w / 2),
    y: viewH / (2 * zoom) - (b.y + b.h / 2),
  };
}

/**
 * Where to drop the next node so it does not land on top of an existing one.
 * Walks a widening spiral of grid slots and takes the first free one, which
 * keeps a freshly spawned agent visible instead of buried.
 */
export function placeNear(
  existing: Rect[],
  size: { w: number; h: number },
  origin: { x: number; y: number },
  gap = 28,
): { x: number; y: number } {
  const overlaps = (a: Rect) =>
    existing.some((b) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y);

  const stepX = size.w + gap;
  const stepY = size.h + gap;
  for (let ring = 0; ring < 24; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        // Only the ring's edge; the interior was covered by earlier rings.
        if (ring > 0 && Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const candidate = { x: origin.x + dx * stepX, y: origin.y + dy * stepY, ...size };
        if (!overlaps(candidate)) return { x: candidate.x, y: candidate.y };
      }
    }
  }
  return { x: origin.x, y: origin.y };
}

/** Snap a value to the canvas grid. Keeps hand-placed nodes visually aligned. */
export const GRID = 20;
export const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;
