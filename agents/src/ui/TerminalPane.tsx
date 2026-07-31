"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import { WebglAddon } from "xterm-addon-webgl";
import {
  Copy,
  Trash2,
  Eraser,
  Maximize2,
  Minimize2,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isAlreadySpawned, markSpawned } from "./spawnGuard.js";
import { useAgentsStore } from "./agentsStore.js";
import { PANE_HEADER_CLASS, themeForKind } from "@swarm/board";
import {
  THEME_CHANGE_EVENT,
  buildXtermThemeFromDom,
  swarmHex,
} from "./themeColors.js";
import { onWindowResize } from "./paneResize.js";

// Plain shell terminal only — whatever shell the launcher picked (PowerShell,
// cmd, Git Bash, WSL, zsh, bash), never a CLI agent. CLI agents
// (Claude Code, Codex CLI, Aider, Gemini CLI, ...) are a separate, standalone
// feature; see components/agents/AgentPane.tsx for that.
interface TerminalPaneProps {
  paneId?: string;
  workingDir?: string | null;
  tabName?: string;
  /** Shell chosen at launch (e.g. "pwsh.exe"). Overrides the in-pane picker until the user switches. */
  shellCommand?: string;
  shellLabel?: string;
  onClose?: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
  onRename?: () => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onCancelRename?: () => void;
  closeIconType?: "trash" | "close";
  /** Extra header control (e.g. worktree selector) rendered next to the name. */
  headerExtra?: React.ReactNode;
}

// The in-pane shell picker this used to have is gone (the launcher chooses the
// shell now), so the CMD/PowerShell/Git Bash/WSL tables it fed went with it.
// What's left is the fallback for a generic "shell" pane opened with no command:
// it was hardcoded to powershell.exe, which on macOS/Linux spawned nothing and
// left a black rectangle that looked like a broken terminal.
function defaultShellCommand(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Windows/i.test(ua)) return "powershell.exe";
  return /Mac OS X|Macintosh/i.test(ua) ? "zsh" : "bash";
}

// xterm's theme with a real opaque background — see AgentPane's paneXtermTheme
// for the full reasoning. The pane's terminal region paints the same token, so
// the partial cell fit() leaves at the right/bottom edge blends into it.
const paneXtermTheme = () => ({
  ...buildXtermThemeFromDom(),
  background: swarmHex("--swarm-canvas-hi"),
});

export default function TerminalPane({
  paneId = "terminal-1",
  workingDir,
  tabName,
  shellCommand,
  shellLabel,
  onClose,
  onToggleMaximize,
  isMaximized,
  onRename,
  isEditing,
  editValue,
  onEditChange,
  onCancelRename,
  closeIconType = "trash",
  headerExtra,
}: TerminalPaneProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Held outside the terminal effect so the live-theme listener can reach it.
  const webglRef = useRef<WebglAddon | null>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  // The pane had no state of its own: a shell that failed to spawn wrote one
  // red line into an otherwise black rectangle, and a slow one showed nothing
  // at all, which is indistinguishable from "the terminal is broken".
  const [status, setStatus] = useState<"connecting" | "running" | "error">("connecting");
  const [errorText, setErrorText] = useState("");

  const displayName = tabName || paneId;
  const refitCount = useAgentsStore((s) => s.refitCount);

  // Re-fit xterm whenever a global refit signal fires (tab switch, maximize/
  // minimize). We intentionally read refitCount outside the main init effect
  // so it never causes a terminal respawn.
  useEffect(() => {
    if (!fitAddonRef.current || !terminalRef.current || !terminalInstance.current) return;
    const rect = terminalRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      try {
        fitAddonRef.current.fit();
        // fit() only repaints when cols/rows actually change — force a
        // redraw too so minimize/restore doesn't leave a ghosted canvas.
        terminalInstance.current.refresh(0, terminalInstance.current.rows - 1);
      } catch {}
    }
  }, [refitCount]);

  // Same ladder as AgentPane, so a shell pane and an agent pane sitting side by
  // side in the grid read at the same size instead of the shell staying at 14px
  // and wrapping every line. Terminals started at a flat 14px here.
  const fontSize = paneWidth === 0 ? 14 : paneWidth < 380 ? 11 : paneWidth < 500 ? 12 : 14;

  useEffect(() => {
    const t = terminalInstance.current;
    if (!t) return;
    t.options.fontSize = fontSize;
    // Only fit against a container that actually has a size — a pane hidden
    // with `display:none` (the right dock does this to keep its inactive tab's
    // process alive) measures 0x0, and fitting to that pushes a nonsense grid
    // to a live pty, reflowing output for a resize the user never made.
    const rect = terminalRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    try {
      fitAddonRef.current?.fit();
      invoke("resize_terminal", { paneId, rows: t.rows, cols: t.cols }).catch(console.error);
    } catch (e) {
      console.warn("Failed to refit terminal after font size change:", e);
    }
  }, [fontSize, paneId]);

  // Pipes data into the spawned process's stdin.
  const writeToProcess = (data: string) => {
    invoke("write_to_terminal", { paneId, data }).catch((e) =>
      console.error(`write_to_terminal failed for ${paneId}:`, e),
    );
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    let disposed = false;
    let terminal: XTerm | null = null;
    let onDataDisposable: { dispose: () => void } | null = null;
    let unsubscribeResize: (() => void) | null = null;
    let observerRef: ResizeObserver | null = null;
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
    let unlistenOutput: UnlistenFn | null = null;
    let webglAddon: WebglAddon | null = null;
    let spawned = false;
    // Last measured grid — used to tell that layout has stopped moving.
    let lastCols = 0;
    let lastRows = 0;
    // Last grid actually pushed to the pty, so an unchanged size costs nothing.
    let lastSyncedCols = 0;
    let lastSyncedRows = 0;

    const hasValidSize = () => {
      if (!terminalRef.current) return false;
      const rect = terminalRef.current.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const spawnProcess = async () => {
      if (spawned || disposed || !terminal) return;
      spawned = true;

      // Output arrives pushed from Rust (`pty-output` events), not polled —
      // polling every open pane every 50ms was the direct cause of lag with
      // several agent/shell panes open at once. MUST be awaited before
      // spawn_terminal (or before trusting a reattach is live): the Rust
      // reader thread starts emitting the instant the pty exists, and Tauri
      // does not replay missed events to a listener that subscribes late —
      // subscribing after spawn would race the shell's own startup output.
      const subscribeOutput = async () => {
        const fn = await listen<{ paneId: string; data: string }>("pty-output", (event) => {
          if (disposed || event.payload.paneId !== paneId || !terminal) return;
          if (!event.payload.data) return;
          terminal.write(event.payload.data);
          // First byte back from the shell is the only honest "it's alive"
          // signal — spawn_terminal resolving just means the pty was created.
          setStatus("running");
        });
        if (disposed) {
          fn();
          return;
        }
        unlistenOutput = fn;
      };
      await subscribeOutput();
      if (disposed || !terminal) return;

      // This shell is still running — the pane was unmounted by a agent
      // switch, not closed. Reattach instead of killing and respawning it.
      if (await isAlreadySpawned(paneId, workingDir)) {
        if (disposed || !terminal) return;
        // The pty kept the size it had in the PREVIOUS pane. If this mount is a
        // different width the shell wraps at the old column count and xterm
        // re-wraps on top of it — mid-word breaks and a phantom gap before the
        // cursor. Push the new size before reading anything back.
        fitAddonRef.current?.fit();
        const { rows, cols } = terminal;
        invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        // Already running — a reattach has nothing new to wait for.
        setStatus("running");
        return;
      }

      // Get working directory
      let spawnDir = workingDir;
      if (!spawnDir) {
        try {
          spawnDir = await invoke<string>("get_project_path");
        } catch (e) {
          try {
            spawnDir = await invoke<string>("get_home_dir");
          } catch (e2) {
            console.error("Failed to get working directory:", e2);
          }
        }
      }

      // Spawn terminal — the shell the launcher picked, else the platform's own.
      try {
        const command = shellCommand || defaultShellCommand();
        // Re-fit right before spawn — get_project_path/get_home_dir above is
        // awaited IPC, and if the grid was still settling during that gap,
        // terminal.cols read without one more fit() here is stale.
        if (disposed || !terminal) return;
        fitAddonRef.current?.fit();
        const { rows, cols } = terminal;

        await invoke("spawn_terminal", {
          paneId,
          command,
          args: [],
          workingDir: spawnDir,
          rows,
          cols,
        });

        markSpawned(paneId, workingDir);
        // Status stays "connecting" here on purpose: the pty exists but the
        // shell has not printed its prompt yet. The pty-output listener flips it.
      } catch (e) {
        if (disposed) return;
        setErrorText(String(e));
        setStatus("error");
        if (terminal) {
          terminal.writeln(`\x1b[31mFailed to spawn terminal: ${e}\x1b[0m`);
        }
      }
    };

    const initTerminal = () => {
      try {
        const options: ITerminalOptions = {
          cursorBlink: true,
          cursorStyle: "block",
          fontSize: 14,
          fontFamily: '"Geist Mono", Cascadia Code, Consolas, monospace',
          fontWeight: "400",
          fontWeightBold: "700",
          // 1 (xterm's own default), not >1 — see AgentPane's initTerminal
          // for why: box-drawing borders and background-colour fills seam
          // between rows once line height stretches past a single cell.
          lineHeight: 1,
          theme: paneXtermTheme(),
          // Opaque on purpose — see paneXtermTheme. Transparency here forced
          // xterm onto its alpha-blending path and locked out the GPU renderer.
          allowTransparency: false,
          rightClickSelectsWord: true,
          scrollback: 1000,
        };

        terminal = new XTerm(options);
        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        fitAddonRef.current = fitAddon;

        terminal.open(terminalRef.current!);
        terminalInstance.current = terminal;

        // GPU renderer — see AgentPane for the reasoning. Registered after
        // open() because the addon attaches to the live canvas, and wrapped
        // because both construction (old Safari) and activation (no WebGL2
        // context, common in VMs and remote sessions) throw rather than
        // degrade: a slow pane is fine, a pane that throws on mount is not.
        try {
          const webgl = new WebglAddon();
          terminal.loadAddon(webgl);
          webglAddon = webgl;
          webglRef.current = webgl;
          // Sleep/wake and driver resets drop the GL context. xterm does not
          // recover on its own — without this the pane goes blank for good.
          webgl.onContextLoss(() => {
            if (webglAddon === webgl) webglAddon = null;
            if (webglRef.current === webgl) webglRef.current = null;
            try {
              webgl.dispose();
            } catch {}
            try {
              terminal?.refresh(0, (terminal.rows ?? 1) - 1);
            } catch {}
          });
        } catch (e) {
          console.warn("[TerminalPane] WebGL renderer unavailable, using fallback:", e);
        }

        const fit = () => {
          if (disposed || !terminal) return false;
          try {
            fitAddon.fit();
            return true;
          } catch (e) {
            console.warn("[TerminalPane] fit() failed:", e);
            return false;
          }
        };

        const syncSize = () => {
          if (disposed || !terminal) return;
          const { rows, cols } = terminal;
          // fit() runs on every tick but usually lands on the same grid, and a
          // pty resize for an unchanged size is a pure IPC round-trip that also
          // makes the shell redraw its prompt.
          if (rows === lastSyncedRows && cols === lastSyncedCols) return;
          lastSyncedRows = rows;
          lastSyncedCols = cols;
          invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        };

        const fitAndSync = () => {
          if (resizeDebounce) clearTimeout(resizeDebounce);
          // Pre-spawn this is the settle window the two-equal-measurements
          // check rides on, so it stays long; afterwards the tick is only a fit
          // plus a deduped resize, and 150ms of it made dragging feel sticky.
          resizeDebounce = setTimeout(() => {
            if (disposed || !terminal) return;
            if (hasValidSize()) {
              if (fit()) {
                if (!spawned) {
                  // A shell prints its banner at whatever width the pty had, and
                  // nothing can re-wrap it afterwards. Spawning on the first
                  // non-zero measurement bakes in a half-laid-out width — the
                  // ragged right edge. Wait until two measurements agree.
                  const { rows, cols } = terminal;
                  if (cols !== lastCols || rows !== lastRows) {
                    lastCols = cols;
                    lastRows = rows;
                    fitAndSync();
                    return;
                  }
                  spawnProcess();
                } else {
                  syncSize();
                }
              }
            }
          }, spawned ? 40 : 150);
        };

        // Pipe user keystrokes into the process's stdin.
        onDataDisposable = terminal.onData((data) => {
          writeToProcess(data);
        });

        // One shared window listener for every pane instead of one each — see
        // paneResize. The ResizeObserver below stays because it reports this
        // container's own geometry (grid reflow, maximize, sibling resize),
        // which no window event does; both funnel into the same debounce so a
        // window resize that also moves this pane still fits exactly once.
        unsubscribeResize = onWindowResize(fitAndSync);

        const resizeObserver = new ResizeObserver((entries) => {
          // Rounded: sub-pixel widths would re-render the header every frame of
          // a drag without ever crossing a font-size threshold.
          for (const entry of entries) setPaneWidth(Math.round(entry.contentRect.width));
          fitAndSync();
        });
        resizeObserver.observe(terminalRef.current!);
        observerRef = resizeObserver;

        // Trigger once to capture initial state if already laid out
        fitAndSync();
      } catch (e) {
        console.error("Failed to initialize terminal:", e);
      }
    };

    initTerminal();

    return () => {
      disposed = true;
      if (resizeDebounce) clearTimeout(resizeDebounce);
      unlistenOutput?.();
      unsubscribeResize?.();
      observerRef?.disconnect();
      onDataDisposable?.dispose();

      // WebGL addon before the terminal: it owns a GL context and a texture
      // atlas, and tearing it down under a half-disposed terminal is what makes
      // dispose() throw. It may also already be gone (context loss).
      try {
        webglRef.current = null;
        webglAddon?.dispose();
        webglAddon = null;
      } catch (e) {
        console.warn('[TerminalPane] Failed to dispose WebGL addon:', e);
      }

      // Then dispose the terminal
      try {
        if (terminal) {
          terminal.dispose();
        }
      } catch (e) {
        console.warn('[TerminalPane] Failed to dispose terminal:', e);
      } finally {
        // Always clear the ref even if disposal throws. No setState here — this
        // also runs on unmount, and the pane it would update is already gone.
        terminalInstance.current = null;
      }
    };
  }, [paneId, shellCommand, workingDir]);

  useEffect(() => {
    const onTheme = () => {
      const t = terminalInstance.current;
      if (!t) return;
      // paneXtermTheme, not the raw helper: its transparent background would
      // leave this rectangle painted in the previous theme's canvas colour,
      // since nothing else repaints behind an opaque terminal.
      t.options.theme = paneXtermTheme();
      try {
        // The GPU renderer caches rasterised glyphs per colour — without
        // dropping the atlas the old theme's text keeps being blitted.
        webglRef.current?.clearTextureAtlas();
        t.refresh(0, t.rows - 1);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, onTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onTheme);
  }, []);

  const handleCopy = () => {
    if (terminalInstance.current) {
      const selection = terminalInstance.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    }
  };

  const handleClear = () => {
    if (terminalInstance.current) {
      terminalInstance.current.clear();
    }
  };


  return (
    <div className="flex flex-col h-full glass-body overflow-hidden">
      {/* Neutral chrome — class identity is the leading accent dot only. */}
      <div data-pane-drag data-pane-header="true" className={`${PANE_HEADER_CLASS} justify-between`}>
        <div className="flex items-center gap-2 min-w-0">
          {isEditing && onEditChange ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRename?.();
                if (e.key === 'Escape') onCancelRename?.();
              }}
              onClick={(e) => e.stopPropagation()}
              className="glass-inset text-swarm-text px-2 py-0.5 rounded-md text-xs w-32 focus:outline-none focus:ring-1 focus:ring-swarm-gold"
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={onRename}
              className="flex min-w-0 items-center gap-1.5 truncate text-xs text-swarm-text font-medium cursor-pointer hover:text-swarm-textDim transition-colors"
              title={displayName}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: themeForKind("shell").accent }}
                title="Shell terminal"
              />
              <span className="truncate">{displayName}</span>
            </span>
          )}

          {/* No separate shell-label chip — the tab name already identifies the
              terminal. Showing both duplicated the name (and reappeared on
              rename). */}
          {headerExtra}
        </div>
        {/* Four icons fit even in a narrow pane once the name truncates. They
            used to disappear below 240px, which didn't make the header smaller
            — it made "clear terminal" stop existing. */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textDim hover:text-swarm-text transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textDim hover:text-swarm-text transition-colors"
            title="Copy selection"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textDim hover:text-swarm-text transition-colors"
            title="Clear terminal"
          >
            <Eraser size={12} />
          </button>
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 rounded-md text-swarm-textDim hover:bg-swarm-err/25 hover:text-swarm-err transition-colors"
              title={closeIconType === "close" ? "Collapse terminal" : "Close terminal"}
            >
              {closeIconType === "close" ? <X size={12} /> : <Trash2 size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* terminal content — bg matches the xterm theme so the whole-cell fit
          remainder on the right/bottom blends in instead of showing a strip
          (and so the opaque GPU-rendered canvas has something to sit on). */}
      <div
        className="flex-1 overflow-hidden relative min-h-0 p-2"
        style={{ contain: "layout paint", background: "rgb(var(--swarm-canvas-hi))" }}
      >
        <div ref={terminalRef} className="absolute inset-2 overflow-hidden" />

        {/* Until the shell prints something this is a black rectangle that
            looks broken; a failed spawn was one red line in it. */}
        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none glass-inset backdrop-blur-[2px] animate-fade-in px-4 text-center">
            {status === "error" ? (
              <>
                <AlertTriangle size={18} className="text-swarm-err" />
                <span className="text-xs text-swarm-textDim">Shell failed to start</span>
                {errorText && (
                  <span className="text-mini text-swarm-textMuted max-w-[260px] break-words">
                    {errorText.slice(0, 160)}
                  </span>
                )}
              </>
            ) : (
              <>
                <Loader2 size={18} className="text-swarm-gold animate-spin" />
                <span className="text-xs text-swarm-textMuted">Starting shell…</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
