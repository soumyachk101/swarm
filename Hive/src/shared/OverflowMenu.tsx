"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface OverflowItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
  onSelect: () => void;
}

/**
 * The app's overflow menu.
 *
 * Everything that acts on the application rather than on a pane lives behind
 * one glyph: settings, extensions, plan limits, opening a project. They were
 * a row of six icons competing with the panes for the same strip; as a menu
 * they cost one button and gain readable labels.
 */
export default function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const rows = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[data-row]") ?? []);
      if (rows.length === 0) return;
      const at = rows.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown"
        ? (at + 1) % rows.length
        : (at - 1 + rows.length) % rows.length;
      rows[next]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>("[data-row]")?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          setRect(btnRef.current?.getBoundingClientRect() ?? null);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More"
        title="More"
        className={`shrink-0 rounded-md p-1 transition-colors ${
          open
            ? "bg-bee-gold/15 text-bee-goldHi"
            : "text-bee-textMuted hover:bg-bee-border/50 hover:text-bee-text"
        }`}
      >
        <MoreHorizontal size={15} />
      </button>

      {open &&
        rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
            <div
              ref={menuRef}
              role="menu"
              aria-label="More"
              className="fixed z-[201] w-56 overflow-hidden rounded-xl glass-hi p-1 shadow-glassHi animate-fade-in"
              style={{ top: rect.bottom + 6, left: Math.max(8, rect.left) }}
            >
              {items.map(({ id, label, hint, icon: Icon, onSelect }) => (
                <button
                  key={id}
                  data-row
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onSelect();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-bee-textDim transition-colors hover:bg-bee-gold/10 hover:text-bee-text"
                >
                  <Icon size={14} className="shrink-0 text-bee-gold" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-mini font-medium">{label}</span>
                    {hint && (
                      <span className="block truncate text-micro text-bee-textMuted">{hint}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
