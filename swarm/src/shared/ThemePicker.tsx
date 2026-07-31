"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Palette } from "lucide-react";
import { THEMES, type ThemeDef } from "@/shared/themes";
import { useThemeStore } from "@/shared/themeStore";

/**
 * Theme chooser.
 *
 * Every row renders a real miniature of the UI — canvas, pane, title bar, text
 * and accent, drawn from that theme's own tokens — so the choice is made by
 * looking, not by reading a label and hoping.
 */

/** Must match the `w-[19rem]` on the panel below — the clamp needs a number. */
const MENU_W = 304;

export default function ThemePicker() {
  const themeId = useThemeStore((s) => s.themeId);
  const setThemeId = useThemeStore((s) => s.setThemeId);
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
      // Arrow keys walk the list, the way a menu is expected to behave.
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[data-theme-row]") ?? []);
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "ArrowDown"
        ? (at + 1) % items.length
        : (at - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the active theme when the menu opens, so keyboard users start
  // somewhere meaningful instead of at the top.
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current?.querySelector<HTMLButtonElement>('[data-theme-row][aria-checked="true"]');
    // `nearest` and not the default: a plain focus() jump-scrolled the list so
    // the active theme landed at the very top with the ones above it hidden.
    el?.scrollIntoView({ block: "nearest" });
    el?.focus({ preventScroll: true });
  }, [open]);

  // The panel is placed from a rect measured at open time; a window resize
  // leaves it floating away from its button, so close rather than mis-place it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);

  const current = THEMES.find((t) => t.id === themeId) ?? THEMES[0];

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => {
          setRect(btnRef.current?.getBoundingClientRect() ?? null);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${current.label}`}
        className={`rounded-md p-1.5 transition-colors ${
          open
            ? "bg-swarm-gold/15 text-swarm-goldHi"
            : "text-swarm-textMuted hover:bg-swarm-border/60 hover:text-swarm-text"
        }`}
        title={`Theme: ${current.label}`}
      >
        <Palette size={14} />
      </button>

      {open &&
        rect &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
            <div
              ref={menuRef}
              role="menu"
              aria-label="Choose theme"
              className="fixed z-[201] w-[19rem] overflow-y-auto scrollbar-sleek rounded-xl glass-hi glass-sheen p-1.5 animate-fade-in"
              // Right-anchoring alone only guarded the right edge: with the
              // trigger near the left of a narrow window the panel ran off the
              // left instead. Eight themes at ~60px a row also overflow a short
              // window, hence the cap and the scroller.
              style={{
                top: rect.bottom + 6,
                right: Math.min(
                  Math.max(8, window.innerWidth - rect.right),
                  Math.max(8, window.innerWidth - MENU_W - 8),
                ),
                maxHeight: Math.max(160, window.innerHeight - rect.bottom - 16),
              }}
            >
              <div className="px-2 pb-1.5 pt-1 text-micro font-semibold uppercase tracking-wider text-swarm-textMuted">
                Theme
              </div>
              {THEMES.map((t) => (
                <ThemeRow
                  key={t.id}
                  theme={t}
                  active={t.id === themeId}
                  onSelect={() => {
                    setThemeId(t.id);
                    setOpen(false);
                    btnRef.current?.focus();
                  }}
                />
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

const rgb = (triplet: string, alpha = 1) =>
  alpha === 1 ? `rgb(${triplet.split(" ").join(",")})` : `rgba(${triplet.split(" ").join(",")},${alpha})`;

/** A miniature of the app rendered in one theme's tokens. */
function ThemeSwatch({ theme }: { theme: ThemeDef }) {
  const k = theme.tokens;
  return (
    <span
      aria-hidden
      className="block h-11 w-16 shrink-0 overflow-hidden rounded-md border"
      style={{ background: rgb(k.canvas), borderColor: rgb(k.border) }}
    >
      {/* pane */}
      <span
        className="mx-1 mt-1 block overflow-hidden rounded-sm border"
        style={{ background: rgb(k.surface), borderColor: rgb(k.border) }}
      >
        {/* title bar with its class dot */}
        <span
          className="flex h-2 items-center gap-0.5 px-0.5"
          style={{ background: rgb(k.surfaceHi) }}
        >
          <span className="block size-1 rounded-full" style={{ background: rgb(k.gold) }} />
          <span className="block h-0.5 w-3 rounded-full" style={{ background: rgb(k.textMuted, 0.7) }} />
        </span>
        {/* body: two text lines and an accent chip */}
        <span className="block space-y-0.5 p-1">
          <span className="block h-0.5 w-full rounded-full" style={{ background: rgb(k.text, 0.75) }} />
          <span className="block h-0.5 w-2/3 rounded-full" style={{ background: rgb(k.textDim, 0.6) }} />
          <span className="block h-1 w-4 rounded-sm" style={{ background: rgb(k.gold) }} />
        </span>
      </span>
    </span>
  );
}

function ThemeRow({
  theme, active, onSelect,
}: {
  theme: ThemeDef;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      data-theme-row
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg border px-2 py-2 text-left transition-colors ${
        active
          ? "border-swarm-gold/40 bg-swarm-gold/[0.08] text-swarm-text"
          : "border-transparent text-swarm-textDim hover:bg-swarm-border/30 hover:text-swarm-text"
      }`}
    >
      <ThemeSwatch theme={theme} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-mini font-semibold">{theme.label}</span>
        <span className="mt-0.5 block text-micro leading-snug text-swarm-textMuted">
          {theme.description}
        </span>
      </span>
      {active && <Check className="size-4 shrink-0 text-swarm-goldHi" />}
    </button>
  );
}
