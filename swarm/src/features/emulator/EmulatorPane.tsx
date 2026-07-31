"use client";

import { useState } from "react";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { PANE_HEADER_CLASS, themeForKind } from "@swarm/board";
import AndroidEmulatorPane from "./android/AndroidEmulatorPane";

/**
 * Emulator pane. Routes to a platform surface — `android/` today; iOS would sit
 * beside it (macOS-only, so it stays a separate folder rather than a branch in
 * one giant component).
 */
export type EmulatorPlatform = "android";

const PLATFORMS: { id: EmulatorPlatform; label: string }[] = [
  { id: "android", label: "Android" },
];

interface Props {
  onClose: () => void;
  onToggleMaximize: () => void;
  isMaximized: boolean;
}

export default function EmulatorPane({ onClose, onToggleMaximize, isMaximized }: Props) {
  const [platform, setPlatform] = useState<EmulatorPlatform>("android");

  return (
    <div className="flex h-full flex-col overflow-hidden glass-body">
      {/* Neutral chrome — class identity is the leading accent dot only. */}
      {/* No `h-6` override: it loses to PANE_HEADER_CLASS's own h-8 on Tailwind's
          class ordering, so it only ever looked like an intention. Matching the
          other panes' header height is the right answer anyway. */}
      <div data-pane-drag data-pane-header="true" className={`${PANE_HEADER_CLASS} gap-1 px-1.5`}>
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: themeForKind("emulator").accent }}
          aria-hidden
        />
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`rounded px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide transition-colors ${
              platform === p.id
                ? "bg-swarm-border/40 text-swarm-text"
                : "text-swarm-textMuted hover:text-swarm-textDim"
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={onToggleMaximize}
            className="rounded p-0.5 text-swarm-textMuted transition-colors hover:bg-swarm-border/50 hover:text-swarm-text"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {/* size-3 across every pane's window controls; 10px here made this
                one look like a different app's chrome. */}
            {isMaximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-swarm-textMuted transition-colors hover:bg-swarm-err/70 hover:text-white"
            title="Close"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {platform === "android" && <AndroidEmulatorPane />}
      </div>
    </div>
  );
}
