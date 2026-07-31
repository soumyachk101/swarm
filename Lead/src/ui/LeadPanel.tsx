"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList, Search, ShieldCheck, type LucideIcon } from "lucide-react";
import type { LeadMode } from "../modes.js";
import { LeadCrown } from "@swarm/board";
import { leadHost } from "./host.js";

// UI-only mode icons — prompts and labels live in @swarm/lead.
const MODE_ICONS: Record<LeadMode, LucideIcon> = {
  Steward: ClipboardList,
  Forager: Search,
  Stinger: ShieldCheck,
};

const MODE_LABELS: Record<LeadMode, string> = {
  Steward: "Steward Manager",
  Forager: "Forager Reviewer",
  Stinger: "Stinger Security",
};

const MODES = ["Steward", "Forager", "Stinger"] as const;

/**
 * Role picker for the reigning Lead — rendered by whoever owns the Lead
 * title bar (the dock tab strip, the fullscreen widget), so the panel itself
 * adds no second header above the CLI's own.
 *
 * Picking a role publishes that charter to .pheromone/lead/ROLE.md; the agent
 * reads it with the lead_role MCP tool. It is deliberately NOT typed into the
 * CLI — pasting a 1.5k-char prompt into a chat box is noise, not configuration.
 */
export function LeadModeSelect() {
  const host = leadHost();
  const lead = host.useLead(host.useActiveWorkspaceId());
  const [open, setOpen] = useState(false);

  if (!lead) return null;

  const mode: LeadMode = lead.leadMode ?? "Steward";
  const ModeIcon = MODE_ICONS[mode];

  const applyMode = (next: LeadMode) => {
    setOpen(false);
    host.setLeadMode(lead.id, next);
    host.publishRole(next);
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md border border-swarm-gold/25 bg-swarm-gold/10 px-2 py-0.5 text-micro font-medium text-swarm-goldHi transition-colors hover:bg-swarm-gold/20"
        title={`${lead.customName || lead.cliName} leads as ${mode} — pick a role to republish its charter`}
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
                    ? "bg-swarm-gold/10 text-swarm-goldHi"
                    : "text-swarm-textDim hover:bg-swarm-border/40 hover:text-swarm-text"
                }`}
              >
                <Icon size={13} className="shrink-0 text-swarm-gold" />
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
 * The Lead tab. Lead is no longer a separate chat agent — it's whichever
 * Agent currently wears the crown, running its own CLI here instead of in
 * the pane grid. The CLI pane brings its own header, so this renders none.
 */
export default function LeadPanel() {
  const host = leadHost();
  // Each agent crowns its own lead — show the one for the folder in view.
  const lead = host.useLead(host.useActiveWorkspaceId());
  const workingDir = host.useActiveFolder();

  if (!lead) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-swarm-gold/10">
          <LeadCrown size={22} className="text-swarm-gold" />
        </div>
        <p className="text-xs font-medium text-swarm-text">No Lead</p>
        <p className="text-mini leading-relaxed text-swarm-textMuted">
          Click the crown on any Agent pane to promote it. It moves here and leads the
          swarm — one CLI at a time.
        </p>
      </div>
    );
  }

  return <host.LeadPane paneId={lead.id} workingDir={workingDir} />;
}
