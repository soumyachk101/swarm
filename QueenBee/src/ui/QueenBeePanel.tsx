"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import type { QueenBeeMode } from "../modes.js";
import { QueenCrown } from "@hiveory/honeyboard";
import { queenBeeHost } from "./host.js";

// UI-only mode icons — prompts and labels live in @hiveory/queenbee.
const MODE_ICONS: Record<QueenBeeMode, LucideIcon> = {
  Steward: ClipboardList,
  Forager: Search,
  Stinger: ShieldCheck,
};

const MODE_LABELS: Record<QueenBeeMode, string> = {
  Steward: "Steward Manager",
  Forager: "Forager Reviewer",
  Stinger: "Stinger Security",
};

const MODES = ["Steward", "Forager", "Stinger"] as const;

/**
 * Role picker for the reigning QueenBee — rendered by whoever owns the QueenBee
 * title bar (the dock tab strip, the fullscreen widget), so the panel itself
 * adds no second header above the CLI's own.
 *
 * Picking a role publishes that charter to .nectar/queen/ROLE.md; the agent
 * reads it with the queen_role MCP tool. It is deliberately NOT typed into the
 * CLI — pasting a 1.5k-char prompt into a chat box is noise, not configuration.
 */
export function QueenModeSelect() {
  const host = queenBeeHost();
  const queen = host.useQueen(host.useActiveWorkspaceId());
  const [open, setOpen] = useState(false);

  if (!queen) return null;

  const mode: QueenBeeMode = queen.queenMode ?? "Steward";
  const ModeIcon = MODE_ICONS[mode];

  const applyMode = (next: QueenBeeMode) => {
    setOpen(false);
    host.setQueenMode(queen.id, next);
    host.publishRole(next);
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md border border-bee-gold/25 bg-bee-gold/10 px-2 py-0.5 text-micro font-medium text-bee-goldHi transition-colors hover:bg-bee-gold/20"
        title={`${queen.customName || queen.cliName} leads as ${mode} — pick a role to republish its charter`}
      >
        <ModeIcon size={11} />
        {mode}
        <ChevronDown size={9} className="opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[130] mt-1 min-w-44 animate-fade-in rounded-lg glass-hi p-1">
          {MODES.map((m) => {
            const Icon = MODE_ICONS[m];
            return (
              <button
                key={m}
                onClick={() => applyMode(m)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                  mode === m
                    ? "bg-bee-gold/10 text-bee-goldHi"
                    : "text-bee-textDim hover:bg-bee-border/40 hover:text-bee-text"
                }`}
              >
                <Icon size={13} className="shrink-0 text-bee-gold" />
                {MODE_LABELS[m]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The QueenBee tab. QueenBee is no longer a separate chat agent — it's whichever
 * WorkerBee currently wears the crown, running its own CLI here instead of in
 * the pane grid. The CLI pane brings its own header, so this renders none.
 */
export default function QueenBeePanel() {
  const host = queenBeeHost();
  // Each workhive crowns its own queen — show the one for the folder in view.
  const queen = host.useQueen(host.useActiveWorkspaceId());
  const workingDir = host.useActiveFolder();

  if (!queen) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-bee-gold/10">
          <QueenCrown size={22} className="text-bee-gold" />
        </div>
        <p className="text-xs font-medium text-bee-text">No QueenBee</p>
        <p className="text-mini leading-relaxed text-bee-textMuted">
          Click the crown on any WorkerBee pane to promote it. It moves here and leads the
          hive — one CLI at a time.
        </p>
      </div>
    );
  }

  return <host.QueenPane paneId={queen.id} workingDir={workingDir} />;
}
