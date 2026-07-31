"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GitBranch, ChevronDown, Check } from "lucide-react";
import type { Worktree } from "../store.js";

/**
 * Compact dropdown to pick which worktree ("tree") an agent/terminal pane runs
 * in. "Main" = the workhive's bound repo path (worktreeId undefined). Picking a
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
        className="flex items-center gap-1 rounded-md border border-bee-border/60 glass-inset px-1.5 py-0.5 text-micro font-medium text-bee-textDim hover:text-bee-text hover:border-bee-gold/40 transition-colors max-w-[120px]"
      >
        <GitBranch className="size-3 shrink-0 text-bee-gold" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-2.5 shrink-0" />
      </button>

      {open && rect && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[201] min-w-40 max-w-56 overflow-hidden rounded-lg glass-hi py-1 shadow-glassHi"
            style={{ top: rect.bottom + 4, right: window.innerWidth - rect.right }}
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
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-mini text-bee-textDim hover:bg-bee-gold/10 hover:text-bee-text transition-colors"
    >
      <GitBranch className="size-3 shrink-0 text-bee-gold" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        <span className="block truncate text-micro text-bee-textMuted">{sub}</span>
      </span>
      {active && <Check className="size-3 shrink-0 text-bee-goldHi" />}
    </button>
  );
}
