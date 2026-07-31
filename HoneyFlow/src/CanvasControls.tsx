"use client";

import { Maximize, Minus, Plus, LayoutGrid, Crosshair } from "lucide-react";
import { MAX_ZOOM, MIN_ZOOM } from "./camera.js";
import { useCanvasStore } from "./canvasStore.js";

/**
 * Canvas navigation. Bottom-right, out of the way of work, but always present:
 * an infinite canvas with no visible zoom level is a place to get lost in.
 */
export default function CanvasControls({
  hiveId, ids, view,
}: {
  hiveId: string;
  ids: string[];
  view: { w: number; h: number };
}) {
  const cameras = useCanvasStore((s) => s.cameras);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const setCamera = useCanvasStore((s) => s.setCamera);
  const fitAll = useCanvasStore((s) => s.fitAll);
  const tidy = useCanvasStore((s) => s.tidy);
  const zoom = cameras[hiveId]?.zoom ?? 1;

  const btn =
    "flex size-6 items-center justify-center rounded-md text-bee-textDim transition-colors hover:bg-bee-gold/15 hover:text-bee-goldHi disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-xl glass-hi px-1.5 py-1 shadow-glass-lg">
      <div className="pointer-events-auto flex items-center gap-0.5">
        <button className={btn} onClick={() => tidy(ids)} disabled={ids.length === 0}
          title="Tidy: lay every pane out in a grid">
          <LayoutGrid className="size-3.5" />
        </button>
        <button className={btn} onClick={() => fitAll(hiveId, ids, view.w, view.h)} disabled={ids.length === 0}
          title="Fit everything on screen">
          <Maximize className="size-3.5" />
        </button>
        <button className={btn} onClick={() => setCamera(hiveId, { x: 0, y: 0, zoom: 1 })}
          title="Back to the origin at 100%">
          <Crosshair className="size-3.5" />
        </button>

        <span className="mx-0.5 h-4 w-px bg-bee-border/60" />

        <button className={btn} onClick={() => setZoom(hiveId, zoom - 0.15, view.w, view.h)}
          disabled={zoom <= MIN_ZOOM} title="Zoom out">
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => setZoom(hiveId, 1, view.w, view.h)}
          title="Reset zoom to 100%"
          className="min-w-10 rounded-md px-1 text-micro font-semibold tabular-nums text-bee-textDim transition-colors hover:bg-bee-gold/15 hover:text-bee-goldHi"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className={btn} onClick={() => setZoom(hiveId, zoom + 0.15, view.w, view.h)}
          disabled={zoom >= MAX_ZOOM} title="Zoom in">
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
