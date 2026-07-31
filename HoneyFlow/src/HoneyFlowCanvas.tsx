"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GRID, screenToWorld, type Camera } from "./camera.js";
import { useCanvasStore } from "./canvasStore.js";
import CanvasNode from "./CanvasNode.js";
import CanvasControls from "./CanvasControls.js";

export interface CanvasItem {
  id: string;
  /** Rendered inside the node frame. The frame supplies chrome and geometry. */
  content: React.ReactNode;
}

interface Props {
  /** Camera and layout are kept per workhive. */
  hiveId: string;
  items: CanvasItem[];
  /** Fired when the user drops something onto empty canvas, in world coords. */
  onCanvasDoubleClick?: (world: { x: number; y: number }) => void;
  /** Terminals must be re-measured after a zoom settles. */
  onZoomSettled?: () => void;
  emptyState?: React.ReactNode;
}

/**
 * An infinite canvas for a workhive: every agent, terminal, browser and toolbox
 * is a node you place where you want it, and the whole surface pans and zooms.
 *
 * The board's grid answers "show me everything in equal slots". The canvas
 * answers "lay my work out the way I think about it" — a reviewer next to the
 * agent it reviews, a preview under the pane that builds it. Both render the
 * exact same panes; only the geometry differs.
 */
export default function HoneyFlowCanvas({
  hiveId, items, onCanvasDoubleClick, onZoomSettled, emptyState,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const nodes = useCanvasStore((s) => s.nodes);
  const cameras = useCanvasStore((s) => s.cameras);
  const ensureNode = useCanvasStore((s) => s.ensureNode);
  const panCamera = useCanvasStore((s) => s.panCamera);
  const zoomCamera = useCanvasStore((s) => s.zoomCamera);
  const cam: Camera = cameras[hiveId] ?? { x: 0, y: 0, zoom: 1 };

  const ids = items.map((i) => i.id);
  const idKey = ids.join("|");

  /*
   * Give every new pane a spot on the canvas.
   *
   * Deliberately does NOT prune the ones it cannot see. `items` is already
   * filtered to the active workhive and the active plane, so pruning here
   * would throw away the layout of every OTHER workhive the moment you
   * switched to this one. A pane's geometry is discarded where the pane is
   * actually destroyed (PlaneHost's remove handler), which is the only place
   * that knows the difference between "gone" and "not currently shown".
   */
  // useLayoutEffect, not useEffect: a node with no geometry yet renders as
  // null, so running this after paint would mount every pane, drop it for a
  // frame, then mount it again — and a WorkerBee pane being torn down and
  // rebuilt means its terminal goes with it.
  useLayoutEffect(() => {
    for (const id of ids) ensureNode(id, ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Panning: drag empty canvas, or middle-drag anywhere ───────────── */
  const panning = useRef<{ x: number; y: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    const onEmpty = e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBackdrop === "true";
    if (e.button === 1 || (e.button === 0 && onEmpty)) {
      panning.current = { x: e.clientX, y: e.clientY };
      setIsPanning(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = panning.current;
    if (!p) return;
    panCamera(hiveId, e.clientX - p.x, e.clientY - p.y);
    panning.current = { x: e.clientX, y: e.clientY };
    setHasNavigated(true);
  };
  const endPan = () => { panning.current = null; setIsPanning(false); };

  /* ── Zoom: wheel over the canvas, anchored at the cursor ───────────── */
  const settleTimer = useRef<number | null>(null);
  const onWheel = useCallback((e: WheelEvent) => {
    const el = viewportRef.current;
    if (!el) return;
    // Trackpad two-finger scroll pans; ctrl/cmd + wheel (and mouse wheel) zooms.
    // That matches every other canvas tool, so muscle memory carries over.
    const r = el.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomCamera(hiveId, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0022));
    } else if (e.shiftKey) {
      e.preventDefault();
      panCamera(hiveId, -e.deltaY, 0);
    } else {
      e.preventDefault();
      panCamera(hiveId, -e.deltaX, -e.deltaY);
    }
    setHasNavigated(true);
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => onZoomSettled?.(), 180);
  }, [hiveId, zoomCamera, panCamera, onZoomSettled]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    // Native listener: React's onWheel is passive, so preventDefault is ignored
    // and the whole app scrolls behind the canvas instead of zooming.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const dot = GRID * cam.zoom;
  const originX = cam.x * cam.zoom;
  const originY = cam.y * cam.zoom;

  return (
    <div
      ref={viewportRef}
      /* Fills its parent outright rather than relying on flex sizing: this
         renders inside a plain block container, where `flex-1` is inert. */
      className={`absolute inset-0 overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDoubleClick={(e) => {
        if (e.target !== e.currentTarget && (e.target as HTMLElement).dataset.canvasBackdrop !== "true") return;
        const r = viewportRef.current!.getBoundingClientRect();
        onCanvasDoubleClick?.(screenToWorld(cam, e.clientX - r.left, e.clientY - r.top));
      }}
    >
      {/* The surface: a dot grid that scales and slides with the camera, over
          the themed canvas gradient. This is the "you are somewhere in a large
          space" cue — without it panning feels like nothing is happening. */}
      <div
        data-canvas-backdrop="true"
        className="absolute inset-0 canvas-surface"
        style={{
          backgroundSize: `${dot}px ${dot}px, ${dot * 5}px ${dot * 5}px`,
          backgroundPosition: `${originX}px ${originY}px, ${originX}px ${originY}px`,
        }}
      />

      {items.length === 0 && emptyState && (
        <div data-canvas-backdrop="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">{emptyState}</div>
        </div>
      )}

      {/* World layer. One transform for everything, so nodes never drift apart
          from the grid they were placed on. */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `scale(${cam.zoom}) translate(${cam.x}px, ${cam.y}px)` }}
      >
        {items.map((item) => (
          <CanvasNode key={item.id} id={item.id} box={nodes[item.id]} zoom={cam.zoom}>
            {item.content}
          </CanvasNode>
        ))}
      </div>

      <CanvasHint used={hasNavigated} />
      <CanvasControls hiveId={hiveId} ids={ids} view={size} />
    </div>
  );
}

const HINT_KEY = "hiveory-canvas-hint-seen";

/**
 * An infinite canvas has no visible affordances: nothing on screen says you can
 * drag the background or zoom it. This says so once, then gets out of the way
 * for good the first time the user does either.
 */
function CanvasHint({ used }: { used: boolean }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!used || dismissed) return;
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* private mode — the hint simply returns next launch */
    }
    setDismissed(true);
  }, [used, dismissed]);

  if (dismissed) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg glass-hi px-2.5 py-1.5 text-micro text-bee-textMuted shadow-glass">
      Drag the canvas to pan · Ctrl + scroll to zoom · drag a pane&apos;s title bar to move it
    </div>
  );
}
