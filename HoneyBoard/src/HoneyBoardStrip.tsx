"use client";

import type { ReactNode } from "react";
import { Plus, X, Maximize2, Minimize2 } from "lucide-react";
import { themeForKind } from "./themes.js";
import HoneyBoardLogo from "./HoneyBoardLogo.js";

export interface StripItem {
  id: string;
  name: string;
  /** WorkerBee kind — drives the chip accent (agent = gold, shell = blade). */
  kind?: string;
  icon?: ReactNode;
}

/**
 * The HoneyBoard board's top strip: the app logo (only when maximized), a chip
 * per open component (name + close), and the + button to add more. Purely
 * presentational — the host owns state and the add menu.
 */
export default function HoneyBoardStrip({
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
  /** App logo shown when maximized (showLogo); falls back to the HoneyBoard mark. */
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
  return (
    // Only the tabs scroll horizontally. App controls and the view switch sit
    // left, then the scrolling tab block, then + and maximize pinned in-flow at
    // the right — so + can never slide under the maximize button.
    <div
      className="flex h-11 shrink-0 items-center gap-1.5 border-b border-bee-border/50 glass-toolbar px-2"
      style={reserveRight ? { paddingRight: reserveRight } : undefined}
      data-tauri-drag-region
    >
      {leading}
      {showLogo && (logoNode ?? <HoneyBoardLogo size={18} className="shrink-0 text-bee-gold" />)}
      {viewToggle}
      {viewToggle && <span className="h-5 w-px shrink-0 bg-bee-border/60" />}

      {items.length > 0 && (
      <div className="flex min-w-0 shrink items-center gap-1.5 overflow-x-auto scrollbar-hair">
      {items.map((it) => {
        const t = themeForKind(it.kind);
        const active = activeId === it.id;
        return (
          <div
            key={it.id}
            onClick={() => onSelect(it.id)}
            className={`group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-mini font-medium transition-colors ${
              active
                ? "border-bee-border/70 glass text-bee-text"
                : "border-transparent text-bee-textDim hover:bg-bee-border/30 hover:text-bee-text"
            }`}
            title={it.name}
          >
            {/* Class identity = colored dot only; pane chrome stays neutral. */}
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: t.accent }}
              aria-hidden
            />
            {it.icon && <span className="shrink-0 text-bee-textMuted">{it.icon}</span>}
            <span className="max-w-[140px] truncate">{it.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(it.id); }}
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-black/25 group-hover:opacity-100"
              title="Close"
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
        ref={addRef}
        onClick={onAdd}
        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-bee-gold/30 bg-bee-gold/10 text-bee-goldHi transition-colors hover:bg-bee-gold/20"
        title="Add component"
      >
        <Plus className="size-4" />
      </button>
      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-bee-textMuted transition-colors hover:bg-black/30 hover:text-bee-text"
          title={fullscreen ? "Restore" : "Maximize plane"}
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
      )}
    </div>
  );
}
