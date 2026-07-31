"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, X, Maximize2, Minimize2, Blocks, KeyRound, Play } from "lucide-react";
import { LeadCrown, PANE_HEADER_CLASS, themeForKind, CLASS_COLORS } from "@swarm/board";
import OpenVsxLogo from "./OpenVsxLogo";

/**
 * Open-VSX component for Board: spawns a local `openvscode-server`
 * (Open-VSX marketplace by default) via a Tauri sidecar and embeds it in an
 * iframe, so real VS Code extensions run inside the board.
 *
 * The server binary is NOT bundled — point this at an installed
 * `openvscode-server` (Settings → binary path, or on PATH). The Rust side owns
 * the process lifecycle (start_openvsx / stop_openvsx).
 */
const BIN_KEY = "swarm_openvsx_bin";
// A tool extension is its own class (green). An AGENT extension — Claude Code,
// Kilo Code, OpenChamber — is an agent that happens to live in an editor, so it
// wears the agent yellow like any other pane. `crown` is only supplied for
// those, which makes it the honest signal for which dot to show.
const TOOL_ACCENT = themeForKind("openvsx").accent;

// ponytail: naive per-pane port from the id hash — fine for a handful of
// panes; add real free-port allocation if collisions show up.
function portForPane(paneId: string): number {
  let h = 0;
  for (let i = 0; i < paneId.length; i++) h = (h * 31 + paneId.charCodeAt(i)) & 0xffff;
  return 3200 + (h % 800);
}

interface Props {
  paneId: string;
  workingDir?: string | null;
  tabName?: string;
  /** Open-VSX extension id to install into this server before serving. */
  extensionId?: string;
  onClose: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
  /** Crown control, supplied for agent extensions only. Wired by the app so
   *  this package never imports the pane store. */
  crown?: { isLead: boolean; taken: boolean; onToggle: () => void };
  /** Passed to the server process, so MCP servers the agent extension spawns
   *  inherit them — that is how a crowned extension gets Lead's tools. */
  env?: Record<string, string>;
}

export default function OpenVsxPane({ paneId, workingDir, tabName = "SwarmExtension", extensionId, onClose, onToggleMaximize, isMaximized, crown, env }: Props) {
  const port = portForPane(paneId);
  const [status, setStatus] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [bin, setBin] = useState<string>(() => localStorage.getItem(BIN_KEY) || "");
  const [configuring, setConfiguring] = useState(false);
  const [src, setSrc] = useState<string>("");

  const start = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      await invoke("start_openvsx", { paneId, bin: bin || null, port, extensions: extensionId ? [extensionId] : null, env: env ?? null });
      // poll readiness
      let ready = false;
      for (let i = 0; i < 60 && !ready; i++) {
        ready = await invoke<boolean>("openvsx_ready", { port }).catch(() => false);
        if (!ready) await new Promise((r) => setTimeout(r, 500));
      }
      // The loop used to fall through on timeout and point the iframe at a port
      // nothing was listening on — 30 seconds of spinner followed by a blank
      // white rectangle and no explanation. Failing here lands in the error
      // state below, which at least offers Retry and Set binary.
      if (!ready) {
        throw new Error(
          `The editor server never answered on port ${port}. It may have failed to start, or it is still unpacking extensions — Retry usually works.`,
        );
      }
      const folder = workingDir ? `?folder=${encodeURIComponent(workingDir)}` : "";
      setSrc(`http://127.0.0.1:${port}/${folder}`);
      setStatus("running");
    } catch (e: any) {
      setError(String(e?.message || e));
      setStatus("error");
    }
  }, [paneId, bin, port, workingDir, extensionId, env]);

  // start on mount; stop on unmount
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) { started.current = true; start(); }
    return () => { invoke("stop_openvsx", { paneId }).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveBin = () => { localStorage.setItem(BIN_KEY, bin); setConfiguring(false); start(); };

  return (
    <div className="flex h-full flex-col overflow-hidden glass-body">
      {/* Neutral chrome — class identity is the leading accent dot only. */}
      <div data-pane-drag data-pane-header="true" className={`${PANE_HEADER_CLASS} justify-between`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: crown ? CLASS_COLORS.worker : TOOL_ACCENT }}
            title={crown ? "Agent extension — joins the swarm" : "Editor extension"}
          />
          <OpenVsxLogo size={13} className="shrink-0 text-swarm-textMuted" />
          <span className="truncate text-xs font-medium text-swarm-text">{tabName}</span>
          <span className="text-micro text-swarm-textMuted">:{port}</span>
        </div>
        <div className="flex items-center gap-1">
          {crown && (
            <button
              onClick={crown.onToggle}
              disabled={crown.taken}
              className={`rounded p-1 transition-colors ${
                crown.isLead
                  ? "bg-swarm-gold/20 text-swarm-goldHi"
                  : crown.taken
                    ? "cursor-not-allowed text-swarm-textMuted/40"
                    : "text-swarm-textMuted hover:bg-swarm-border/50 hover:text-swarm-gold"
              }`}
              title={
                crown.isLead
                  ? "Demote from Lead — returns this agent to the grid"
                  : crown.taken
                    ? "This folder already has a Lead — demote it first"
                    : "Make Lead — moves this agent to the Lead tab"
              }
            >
              <LeadCrown size={13} />
            </button>
          )}
          <button onClick={() => setConfiguring(true)} className="rounded p-1 text-swarm-textMuted hover:bg-swarm-border/50 hover:text-swarm-text" title="Editor server (optional override)">
            <KeyRound className="size-3.5" />
          </button>
          {onToggleMaximize && (
            <button onClick={onToggleMaximize} className="rounded p-1 text-swarm-textMuted hover:bg-swarm-border/50 hover:text-swarm-text" title={isMaximized ? "Restore" : "Maximize"}>
              {isMaximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          )}
          <button onClick={onClose} className="rounded p-1 text-swarm-textMuted hover:bg-swarm-border/50 hover:text-swarm-text" title="Close">
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {configuring ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <Blocks className="size-6 text-swarm-honey" />
            <div className="text-sm font-medium text-swarm-text">Editor server</div>
            <p className="max-w-[42ch] text-mini leading-relaxed text-swarm-textMuted">
              Normally nothing to set: Swarm uses your Visual Studio Code install
              (<code>code serve-web</code>), or <code>openvscode-server</code> if it is on PATH.
              gitpod publishes openvscode-server for Linux only, which is why VS Code is
              the default on Windows and macOS. Override the executable here only if
              yours lives somewhere unusual.
            </p>
            <input
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              placeholder="Leave blank — auto-detected"
              className="w-full max-w-sm rounded-md border border-swarm-border/60 glass-inset px-2.5 py-1.5 text-xs font-mono text-swarm-text outline-none focus:border-swarm-gold/60"
            />
            <div className="flex gap-2">
              <button onClick={saveBin} className="flex items-center gap-1 rounded-lg bg-swarm-gold px-3 py-1.5 text-xs font-semibold text-swarm-canvas">
                <Play className="size-3.5" /> Start
              </button>
              <button onClick={() => setConfiguring(false)} className="rounded-lg border border-swarm-border/60 px-3 py-1.5 text-xs text-swarm-textDim hover:text-swarm-text">
                Cancel
              </button>
            </div>
          </div>
        ) : status === "running" && src ? (
          <iframe src={src} title={tabName} className="h-full w-full border-0" allow="clipboard-read; clipboard-write" />
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-xs font-medium text-swarm-err">Couldn't start openvscode-server</p>
            <p className="max-w-[34ch] text-mini text-swarm-textMuted">{error}</p>
            <div className="mt-1 flex gap-2">
              <button onClick={start} className="flex items-center gap-1.5 rounded-md border border-swarm-honey/40 px-3 py-1 text-xs text-swarm-honey">
                <RefreshCw className="size-3" /> Retry
              </button>
              <button onClick={() => setConfiguring(true)} className="rounded-md border border-swarm-border/60 px-3 py-1 text-xs text-swarm-textDim hover:text-swarm-text">
                Set binary
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-swarm-textMuted">
            <RefreshCw className="size-5 animate-spin text-swarm-honey" />
            <span className="text-xs">Starting the editor server…</span>
            {/* A silent 30s spinner is indistinguishable from a hang. Naming the
                slow part up front stops it from reading as one. */}
            <span className="max-w-[36ch] text-micro leading-relaxed">
              First run installs extensions, which can take half a minute.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
