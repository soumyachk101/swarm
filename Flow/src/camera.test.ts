import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAMERA, MAX_ZOOM, MIN_ZOOM, boundsOf, clampZoom, fitTo, panBy, placeNear,
  screenToWorld, snap, worldToScreen, zoomAbout, type Rect,
} from "./camera.js";

const rect = (x: number, y: number, w = 100, h = 100): Rect => ({ x, y, w, h });

describe("coordinate spaces", () => {
  it("round-trips screen -> world -> screen", () => {
    const cam = { x: -120, y: 40, zoom: 1.35 };
    const w = screenToWorld(cam, 300, 220);
    const s = worldToScreen(cam, w.x, w.y);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(220);
  });
});

describe("zoomAbout", () => {
  it("keeps the world point under the cursor pinned", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const before = screenToWorld(cam, 640, 400);
    const zoomed = zoomAbout(cam, 640, 400, 1.4);
    const after = screenToWorld(zoomed, 640, 400);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("holds the pin across a zoom in then out", () => {
    let cam = { x: 15, y: -30, zoom: 1 };
    const target = screenToWorld(cam, 200, 150);
    cam = zoomAbout(cam, 200, 150, 1.25);
    cam = zoomAbout(cam, 200, 150, 1 / 1.25);
    const after = screenToWorld(cam, 200, 150);
    expect(after.x).toBeCloseTo(target.x);
    expect(after.y).toBeCloseTo(target.y);
  });

  it("clamps and stops changing at the limits", () => {
    let cam = { x: 0, y: 0, zoom: MAX_ZOOM };
    expect(zoomAbout(cam, 10, 10, 2).zoom).toBe(MAX_ZOOM);
    cam = { x: 0, y: 0, zoom: MIN_ZOOM };
    expect(zoomAbout(cam, 10, 10, 0.5).zoom).toBe(MIN_ZOOM);
  });

  it("returns the same camera object when the zoom cannot change", () => {
    const cam = { x: 3, y: 4, zoom: MAX_ZOOM };
    expect(zoomAbout(cam, 0, 0, 4)).toBe(cam);
  });
});

describe("clampZoom", () => {
  it("bounds the range", () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("panBy", () => {
  it("moves less in world units the further you are zoomed in", () => {
    const a = panBy({ x: 0, y: 0, zoom: 1 }, 100, 0);
    const b = panBy({ x: 0, y: 0, zoom: 2 }, 100, 0);
    expect(a.x).toBe(100);
    expect(b.x).toBe(50);
  });
  it("leaves zoom alone", () => {
    expect(panBy({ x: 0, y: 0, zoom: 1.7 }, 5, 5).zoom).toBe(1.7);
  });
});

describe("boundsOf", () => {
  it("covers every rect", () => {
    expect(boundsOf([rect(0, 0), rect(200, 150)])).toEqual({ x: 0, y: 0, w: 300, h: 250 });
  });
  it("handles negative coordinates", () => {
    expect(boundsOf([rect(-50, -80, 50, 80), rect(0, 0, 10, 10)])).toEqual({ x: -50, y: -80, w: 60, h: 90 });
  });
  it("is null when there is nothing", () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe("fitTo", () => {
  it("centres the content in the viewport", () => {
    const rects = [rect(0, 0, 400, 300)];
    const cam = fitTo(rects, 1200, 800);
    const topLeft = worldToScreen(cam, 0, 0);
    const bottomRight = worldToScreen(cam, 400, 300);
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(600);
    expect((topLeft.y + bottomRight.y) / 2).toBeCloseTo(400);
  });

  it("never exceeds the zoom limits for tiny content", () => {
    expect(fitTo([rect(0, 0, 4, 4)], 1200, 800).zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });

  it("zooms out for content larger than the viewport", () => {
    expect(fitTo([rect(0, 0, 4000, 3000)], 1200, 800).zoom).toBeLessThan(1);
  });

  it("falls back to the default camera with nothing to frame", () => {
    expect(fitTo([], 1200, 800)).toEqual(DEFAULT_CAMERA);
    expect(fitTo([rect(0, 0)], 0, 0)).toEqual(DEFAULT_CAMERA);
  });
});

describe("placeNear", () => {
  it("uses the origin when the space is free", () => {
    expect(placeNear([], { w: 100, h: 100 }, { x: 40, y: 40 })).toEqual({ x: 40, y: 40 });
  });

  it("never overlaps an existing node", () => {
    const existing = [rect(0, 0, 200, 160), rect(228, 0, 200, 160)];
    const spot = placeNear(existing, { w: 200, h: 160 }, { x: 0, y: 0 });
    const clash = existing.some(
      (b) => spot.x < b.x + b.w && spot.x + 200 > b.x && spot.y < b.y + b.h && spot.y + 160 > b.y,
    );
    expect(clash).toBe(false);
  });

  it("keeps finding room as nodes pile up", () => {
    const placed: Rect[] = [];
    for (let i = 0; i < 12; i++) {
      const p = placeNear(placed, { w: 180, h: 140 }, { x: 0, y: 0 });
      expect(placed.some((b) => p.x < b.x + b.w && p.x + 180 > b.x && p.y < b.y + b.h && p.y + 140 > b.y)).toBe(false);
      placed.push({ ...p, w: 180, h: 140 });
    }
    expect(placed).toHaveLength(12);
  });
});

describe("snap", () => {
  it("rounds to the nearest grid line", () => {
    expect(snap(23)).toBe(20);
    expect(snap(31)).toBe(40);
    expect(snap(-9)).toBe(-0);
  });
});
