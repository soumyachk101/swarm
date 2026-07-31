"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GitBranch, ChevronDown, Check } from "lucide-react";
import type { Worktree } from "../store.js";

/**
 * Compact dropdown to pick which worktree ("tree") an agent/terminal pane runs
 * in. "Main" = the agent's bound repo path (worktreeId undefined). Picking a
 * tree changes the pane's working directory, which respawns the process there.
 */
export default function WorktreeSelect({
  trees,
  value,
  onChange,
}: {
  trees: Worktree[];
  value?: string;
  onChange: (worktreeId: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // ponytail: measured on open, not tracked on scroll/resize — menu closes on
  // any outside interaction anyway, so a stale rect can't linger.
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Escape has to close it: the backdrop only catches pointers, so a keyboard
  // user who opened the menu had no way out of it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!trees.length) return null; // nothing to pick until trees exist

  const current = trees.find((t) => t.id === value);
  const label = current ? current.name : "Main";

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => {
          setRect(btnRef.current?.getBoundingClientRect() ?? null);
          setOpen((v) => !v);
        }}
        title={current ? `Tree: ${current.name} (${current.branch})` : "Main repo"}
        aria-haspopup="menu"
        aria-expanded={open}
        // 26px is the app's chip height; this used to be a ~19px control inside a
        // 32px pane header, which is why the header row looked ragged.
        className="flex h-[26px] max-w-[120px] items-center gap-1 rounded-md border border-swarm-border/60 glass-inset px-1.5 text-micro font-medium text-swarm-textDim transition-colors hover:border-swarm-gold/40 hover:text-swarm-text"
      >
        <GitBranch className="size-3 shrink-0 text-swarm-gold" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-2.5 shrink-0" />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} onContextMenu={(e) => { e.preventDefault(); setOpen(false); }} />
          {/* Flips above the button when there isn't room below, and scrolls
              past ~8 trees. Pinned to rect.bottom it ran off the bottom of the
              window for any pane in the lower half of the board, where the list
              was simply unreachable. */}
          <div
            className="fixed z-[201] min-w-40 max-w-56 max-h-64 overflow-y-auto scrollbar-sleek rounded-lg glass-hi py-1"
            style={
              window.innerHeight - rect.bottom < 200 && rect.top > 200
                ? { bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right }
                : { top: rect.bottom + 4, right: window.innerWidth - rect.right }
            }
          >
            <MenuRow active={!value} onClick={() => { onChange(undefined); setOpen(false); }} label="Main" sub="bound repo" />
            {trees.map((t) => (
              <MenuRow key={t.id} active={value === t.id} onClick={() => { onChange(t.id); setOpen(false); }} label={t.name} sub={t.branch} />
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function MenuRow({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-mini text-swarm-textDim hover:bg-swarm-gold/10 hover:text-swarm-text transition-colors"
    >
      <GitBranch className="size-3 shrink-0 text-swarm-gold" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className="block truncate text-micro text-swarm-textMuted">{sub}</span>
      </span>
      {active && <Check className="size-3 shrink-0 text-swarm-goldHi" />}
    </button>
  );
}
