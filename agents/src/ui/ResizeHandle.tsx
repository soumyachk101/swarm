'use client';

import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  className?: string;
}

/** Keyboard nudge per arrow press; Shift jumps in bigger steps. */
const STEP = 6;

export default function ResizeHandle({ direction, onResize, onResizeEnd, className = '' }: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const lastRef = useRef(0);
  const horizontal = direction === 'horizontal';

  // While a drag is live the pointer spends most of its time over a terminal or
  // a webview, each of which paints its own cursor and starts its own text
  // selection. Owning both on <body> for the duration keeps the resize cursor
  // steady and stops the drag from selecting half a transcript on the way past.
  useEffect(() => {
    if (!dragging) return;
    const body = document.body;
    const prevCursor = body.style.cursor;
    const prevSelect = body.style.userSelect;
    body.style.cursor = horizontal ? 'row-resize' : 'col-resize';
    body.style.userSelect = 'none';
    return () => {
      body.style.cursor = prevCursor;
      body.style.userSelect = prevSelect;
    };
  }, [dragging, horizontal]);

  // Pointer capture instead of document-level mouse listeners: the panes either
  // side of a handle are PTY terminals and embedded webviews that swallow mouse
  // events, so a drag that strayed off the strip used to stall halfway. Capture
  // routes every move back to this element until release, whatever it crosses.
  // Release is implicit on pointerup, so there is nothing to unwind by hand.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastRef.current = horizontal ? e.clientY : e.clientX;
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const pos = horizontal ? e.clientY : e.clientX;
    onResize(pos - lastRef.current);
    lastRef.current = pos;
  };

  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    onResizeEnd?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const back = horizontal ? 'ArrowUp' : 'ArrowLeft';
    const fwd = horizontal ? 'ArrowDown' : 'ArrowRight';
    if (e.key !== back && e.key !== fwd) return;
    e.preventDefault();
    onResize((e.key === back ? -1 : 1) * (e.shiftKey ? STEP * 4 : STEP));
    onResizeEnd?.();
  };

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className={`
        group relative z-10 flex shrink-0 items-center justify-center
        ${horizontal ? 'h-1.5 w-full cursor-row-resize' : 'h-full w-1.5 cursor-col-resize'}
        ${dragging ? 'bg-swarm-gold' : 'bg-swarm-border/60 hover:bg-swarm-gold/60'}
        touch-none select-none transition-colors duration-150
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-swarm-gold
        ${className}
      `}
    >
      {/* A 6px strip is a coin-flip to hit with a mouse. This overhangs the
          visual line by 4px on each side to give the pointer something to aim
          at, without occupying any layout space of its own. */}
      <span
        aria-hidden
        className={`absolute ${horizontal ? '-inset-y-1 inset-x-0' : '-inset-x-1 inset-y-0'}`}
      />
      <GripVertical
        size={12}
        className="pointer-events-none text-swarm-textMuted opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}
