"use client";

import { Maximize, Minus, Plus, LayoutGrid, Crosshair } from "lucide-react";
import { MAX_ZOOM, MIN_ZOOM } from "./camera.js";
import { useCanvasStore } from "./canvasStore.js";

/**
 * Canvas navigation. Bottom-right, out of the way of work, but always present:
 * an infinite canvas with no visible zoom level is a place to get lost in.
 */
export default function CanvasControls({
  swarmId, ids, view,
}: {
  swarmId: string;
  ids: string[];
  view: { w: number; h: number };
}) {
  const cameras = useCanvasStore((s) => s.cameras);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const setCamera = useCanvasStore((s) => s.setCamera);
  const fitAll = useCanvasStore((s) => s.fitAll);
  const tidy = useCanvasStore((s) => s.tidy);
  const zoom = cameras[swarmId]?.zoom ?? 1;

  // Zoom in fixed *ratios*, not fixed amounts. A flat ±0.15 is a 7% nudge at
  // 2.2x and a 75% leap at 0.2x, so the buttons feel dead when zoomed in and
  // violent when zoomed out. A constant ratio feels the same everywhere.
  const STEP = 1.25;

  const btn =
    "flex size-7 items-center justify-center rounded-md text-swarm-textDim transition-colors hover:bg-swarm-gold/15 hover:text-swarm-goldHi disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-swarm-textDim";

  return (
    // The whole bar is interactive, not just the buttons: with the container
    // pointer-events-none, a press on its padding or between two buttons fell
    // through to the canvas and started a pan under the panel.
    <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl glass-hi px-1.5 py-1 shadow-glass-lg">
      <button type="button" className={btn}
        // Tidy re-lays panes from the world origin, which is very often not
        // where the camera is — without the fit that follows, the button looks
        // like it did nothing at all.
        onClick={() => { tidy(ids); fitAll(swarmId, ids, view.w, view.h); }}
        disabled={ids.length === 0}
        title="Tidy: lay every pane out in a grid" aria-label="Tidy panes into a grid">
        <LayoutGrid className="size-3.5" />
      </button>
      <button type="button" className={btn} onClick={() => fitAll(swarmId, ids, view.w, view.h)}
        disabled={ids.length === 0}
        title="Fit everything on screen" aria-label="Fit everything on screen">
        <Maximize className="size-3.5" />
      </button>
      <button type="button" className={btn} onClick={() => setCamera(swarmId, { x: 0, y: 0, zoom: 1 })}
        title="Back to the origin at 100%" aria-label="Back to the origin at 100%">
        <Crosshair className="size-3.5" />
      </button>

      <span className="mx-0.5 h-4 w-px bg-swarm-border/60" />

      <button type="button" className={btn} onClick={() => setZoom(swarmId, zoom / STEP, view.w, view.h)}
        disabled={zoom <= MIN_ZOOM} title="Zoom out" aria-label="Zoom out">
        <Minus className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setZoom(swarmId, 1, view.w, view.h)}
        title="Reset zoom to 100%"
        aria-label={`Zoom ${Math.round(zoom * 100)} percent. Reset to 100%`}
        className="h-7 min-w-11 rounded-md px-1 text-micro font-semibold tabular-nums text-swarm-textDim transition-colors hover:bg-swarm-gold/15 hover:text-swarm-goldHi"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" className={btn} onClick={() => setZoom(swarmId, zoom * STEP, view.w, view.h)}
        disabled={zoom >= MAX_ZOOM} title="Zoom in" aria-label="Zoom in">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
