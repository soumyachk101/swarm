"use client";

import { useRef, useState } from "react";
import { useCanvasStore, type NodeBox } from "./canvasStore.js";

interface Props {
  id: string;
  box?: NodeBox;
  zoom: number;
  children: React.ReactNode;
}

/**
 * One node on the canvas: a glass frame holding a real pane.
 *
 * Dragging is bound to the pane's own title bar (which already carries
 * `cursor-grab`), not the whole frame — otherwise clicking inside a terminal
 * would drag the window out from under the cursor.
 */
export default function CanvasNode({ id, box, zoom, children }: Props) {
  const moveNode = useCanvasStore((s) => s.moveNode);
  const resizeNode = useCanvasStore((s) => s.resizeNode);
  const raiseNode = useCanvasStore((s) => s.raiseNode);

  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const resize = useRef<{ px: number; py: number; w: number; h: number } | null>(null);
  const [live, setLive] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  if (!box) return null;
  const shown = live ?? box;

  const startDrag = (e: React.PointerEvent) => {
    // Only the header drags, and only with the left button.
    const el = e.target as HTMLElement;
    if (e.button !== 0) return;
    if (el.closest("button, input, select, textarea, a, [role='button']")) return;
    if (!el.closest("[data-pane-header]")) return;
    drag.current = { px: e.clientX, py: e.clientY, x: box.x, y: box.y };
    setLive({ ...box });
    raiseNode(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
  };

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    resize.current = { px: e.clientX, py: e.clientY, w: box.w, h: box.h };
    setLive({ ...box });
    raiseNode(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.stopPropagation();
    e.preventDefault();
  };

  const onMove = (e: React.PointerEvent) => {
    // Pointer deltas are in screen pixels; the world is scaled, so divide or
    // the node runs away from the cursor at anything but 100% zoom.
    if (drag.current) {
      const d = drag.current;
      setLive({ ...box, x: d.x + (e.clientX - d.px) / zoom, y: d.y + (e.clientY - d.py) / zoom });
      e.stopPropagation();
    } else if (resize.current) {
      const r = resize.current;
      setLive({
        ...box,
        w: Math.max(260, r.w + (e.clientX - r.px) / zoom),
        h: Math.max(160, r.h + (e.clientY - r.py) / zoom),
      });
      e.stopPropagation();
    }
  };

  const commit = () => {
    if (live) {
      if (drag.current) moveNode(id, live.x, live.y);
      if (resize.current) resizeNode(id, live.w, live.h);
    }
    drag.current = null;
    resize.current = null;
    setLive(null);
  };

  const dragging = live !== null;

  return (
    <div
      className={`absolute flex flex-col overflow-hidden rounded-xl glass ${
        dragging ? "shadow-glass-lg ring-1 ring-swarm-gold/40" : "hover:shadow-glass-lg"
      }`}
      style={{
        left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: box.z,
        // Snapping during a drag would make the node stutter; snap on drop.
        transition: dragging ? "none" : "box-shadow 0.2s ease",
        // Same reason as the viewport: without it a pen/touch drag on the title
        // bar is stolen by the browser's scroll gesture partway through.
        touchAction: "none",
      }}
      onPointerDown={startDrag}
      onPointerMove={onMove}
      onPointerUp={commit}
      onPointerCancel={commit}
      onMouseDownCapture={() => raiseNode(id)}
    >
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

      {/* Resize grip. Sized in screen pixels so it stays grabbable when zoomed
          out. The padding pulls the chevron clear of the frame's rounded
          corner, which was slicing the ends off both strokes; the hit area
          keeps the full square. */}
      <div
        onPointerDown={startResize}
        onPointerMove={onMove}
        onPointerUp={commit}
        onPointerCancel={commit}
        title="Resize"
        className="absolute bottom-0 right-0 cursor-nwse-resize"
        style={{ width: 20 / zoom, height: 20 / zoom, padding: 4 / zoom, boxSizing: "border-box", touchAction: "none" }}
      >
        <svg viewBox="0 0 16 16" className="size-full text-swarm-textMuted/70">
          <path d="M15 6 6 15M15 11l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
