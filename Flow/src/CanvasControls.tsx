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

  const btn =
    "flex size-6 items-center justify-center rounded-md text-swarm-textDim transition-colors hover:bg-swarm-gold/15 hover:text-swarm-goldHi disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-xl glass-hi px-1.5 py-1 shadow-glass-lg">
      <div className="pointer-events-auto flex items-center gap-0.5">
        <button className={btn} onClick={() => tidy(ids)} disabled={ids.length === 0}
          title="Tidy: lay every pane out in a grid">
          <LayoutGrid className="size-3.5" />
        </button>
        <button className={btn} onClick={() => fitAll(swarmId, ids, view.w, view.h)} disabled={ids.length === 0}
          title="Fit everything on screen">
          <Maximize className="size-3.5" />
        </button>
        <button className={btn} onClick={() => setCamera(swarmId, { x: 0, y: 0, zoom: 1 })}
          title="Back to the origin at 100%">
          <Crosshair className="size-3.5" />
        </button>

        <span className="mx-0.5 h-4 w-px bg-swarm-border/60" />

        <button className={btn} onClick={() => setZoom(swarmId, zoom - 0.15, view.w, view.h)}
          disabled={zoom <= MIN_ZOOM} title="Zoom out">
          <Minus className="size-3.5" />
        </button>
        <button
          onClick={() => setZoom(swarmId, 1, view.w, view.h)}
          title="Reset zoom to 100%"
          className="min-w-10 rounded-md px-1 text-micro font-semibold tabular-nums text-swarm-textDim transition-colors hover:bg-swarm-gold/15 hover:text-swarm-goldHi"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className={btn} onClick={() => setZoom(swarmId, zoom + 0.15, view.w, view.h)}
          disabled={zoom >= MAX_ZOOM} title="Zoom in">
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
