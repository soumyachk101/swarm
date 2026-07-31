"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Plus, X, Maximize2, Minimize2 } from "lucide-react";
import { themeForKind } from "./themes.js";
import { activatable } from "./activatable.js";
import BoardLogo from "./BoardLogo.js";

export interface StripItem {
  id: string;
  name: string;
  /** Agent kind — drives the chip accent (agent = gold, shell = blade). */
  kind?: string;
  icon?: ReactNode;
}

/**
 * The Board board's top strip: the app logo (only when maximized), a chip
 * per open component (name + close), and the + button to add more. Purely
 * presentational — the host owns state and the add menu.
 */
export default function BoardStrip({
  items,
  activeId,
  showLogo = false,
  onSelect,
  onClose,
  onAdd,
  addRef,
  fullscreen,
  onToggleFullscreen,
  logoNode,
  viewToggle,
  leading,
  reserveRight,
}: {
  items: StripItem[];
  activeId?: string | null;
  showLogo?: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  addRef?: React.Ref<HTMLButtonElement>;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** App logo shown when maximized (showLogo); falls back to the Board mark. */
  logoNode?: ReactNode;
  /** Board / Flow switch. Rendered leftmost: it changes what the whole
   *  surface below is, so it outranks anything acting on a single pane. */
  viewToggle?: ReactNode;
  /** App-level controls (mark, sidebar toggles). This row is the top of the
   *  window in its column — there is no bar above it to hold them. */
  leading?: ReactNode;
  /** Right padding reserved for the floating window controls, so the last
   *  chip and the `+` never slide underneath them. */
  reserveRight?: number;
}) {
  // The strip scrolls once enough panes are open, and panes are just as often
  // activated from somewhere else (a keyboard shortcut, the sidebar, a drag
  // swap) as from the strip itself. Without this the active chip can sit
  // scrolled off-screen and the strip looks like it lost the selection.
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  return (
    // Only the tabs scroll horizontally. App controls and the view switch sit
    // left, then the scrolling tab block, then + and maximize pinned in-flow at
    // the right — so + can never slide under the maximize button.
    <div
      className="flex h-11 shrink-0 items-center gap-1.5 border-b border-swarm-border/50 glass-toolbar px-2"
      style={reserveRight ? { paddingRight: reserveRight } : undefined}
      data-tauri-drag-region
    >
      {leading}
      {showLogo && (logoNode ?? <BoardLogo size={18} className="shrink-0 text-swarm-gold" />)}
      {viewToggle}
      {viewToggle && <span className="h-5 w-px shrink-0 bg-swarm-border/60" />}

      {items.length > 0 && (
      <div className="flex min-w-0 shrink items-center gap-1.5 overflow-x-auto scrollbar-hair">
      {items.map((it) => {
        const t = themeForKind(it.kind);
        const active = activeId === it.id;
        return (
          <div
            key={it.id}
            ref={active ? activeRef : undefined}
            onClick={() => onSelect(it.id)}
            // A chip can't be a <button>: it nests the close button, which is
            // invalid HTML. activatable() restores the tab stop and Enter/Space.
            {...activatable(() => onSelect(it.id), it.name)}
            aria-current={active ? "true" : undefined}
            // 26px chip, the one chip/tab height in the app. `glass` is a pane
            // FRAME (border, rim light, drop shadow) — on a 26px chip it read as
            // a floating card inside the toolbar. The active chip is the same
            // surface its focused pane header lifts to instead, so a chip and
            // its pane obviously state the same thing.
            className={`group flex h-6.5 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 text-mini font-medium transition-colors ${
              active
                ? "border-swarm-borderHi bg-swarm-surfaceHi text-swarm-text"
                : "border-transparent text-swarm-textDim hover:bg-swarm-border/30 hover:text-swarm-text"
            }`}
            title={it.name}
          >
            {/* Class identity = colored dot only; pane chrome stays neutral.
                The active chip haloes its dot instead of tinting the chip:
                glass-on-glass alone is too quiet to spot in a full strip. */}
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: t.accent, boxShadow: active ? `0 0 0 3px ${t.accentSoft}` : undefined }}
              aria-hidden
            />
            {it.icon && <span className="shrink-0 text-swarm-textMuted">{it.icon}</span>}
            <span className="max-w-[140px] truncate">{it.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(it.id); }}
              // opacity-0 alone made this unreachable by keyboard: it stayed
              // invisible while focused, so Tab landed on a button nobody could
              // see. focus-visible reveals it the same way hover does.
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-swarm-border/60 hover:text-swarm-text group-hover:opacity-100 focus-visible:opacity-100"
              title={`Close ${it.name}`}
              aria-label={`Close ${it.name}`}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      </div>
      )}

      {/* + and maximize sit OUTSIDE the scroller (scrollbar spans only the tabs)
          and in normal flow, so + trails the tabs and stops next to maximize —
          never behind it. */}
      <button
        type="button"
        ref={addRef}
        onClick={onAdd}
        className="flex size-6.5 shrink-0 items-center justify-center rounded-md border border-swarm-gold/30 bg-swarm-gold/10 text-swarm-goldHi transition-colors hover:bg-swarm-gold/20"
        title="Add component"
        aria-label="Add component"
      >
        <Plus className="size-4" />
      </button>
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          // Tokenised hover, not bg-black: on the lighter themes a black wash
          // reads as a hole punched in the toolbar rather than a hover state.
          // No `ml-auto`: it shoved this button to the far right and left a dead
          // stretch of toolbar between it and `+` that read as a missing group.
          // The empty run at the right end is the window controls' reserved
          // space (reserveRight), not a gap in the layout.
          className="flex size-6.5 shrink-0 items-center justify-center rounded-md text-swarm-textMuted transition-colors hover:bg-swarm-border/60 hover:text-swarm-text"
          title={fullscreen ? "Restore" : "Maximize plane"}
          aria-label={fullscreen ? "Restore" : "Maximize plane"}
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
