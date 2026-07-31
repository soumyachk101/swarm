"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import {
  Terminal,
  Copy,
  Trash2,
  Eraser,
  Maximize2,
  Minimize2,
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
} from "./themeColors.js";

// Plain shell terminal only — cmd / PowerShell / Git Bash / WSL. CLI agents
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

type TerminalType = "cmd" | "powershell" | "git-bash" | "wsl";

const TERMINAL_LABELS: Record<TerminalType, string> = {
  cmd: "CMD",
  powershell: "PowerShell",
  "git-bash": "Git Bash",
  wsl: "WSL",
};

const TERMINAL_COMMANDS: Record<TerminalType, string> = {
  cmd: "cmd.exe",
  powershell: "powershell.exe",
  "git-bash": "bash.exe",
  wsl: "wsl.exe",
};

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
  const [, setIsSpawned] = useState(false);
  const [paneWidth, setPaneWidth] = useState(0);
  const [selectedTerminal, setSelectedTerminal] = useState<TerminalType>("powershell");
  // The shell chosen at launch. Cleared when the user picks from the in-pane
  // menu, so that menu takes over from then on.
  const [launchCommand, setLaunchCommand] = useState<string | undefined>(shellCommand);

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
    let handleResize: (() => void) | null = null;
    let observerRef: ResizeObserver | null = null;
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
    let unlistenOutput: UnlistenFn | null = null;
    let spawned = false;
    // Last measured grid — used to tell that layout has stopped moving.
    let lastCols = 0;
    let lastRows = 0;

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
          if (event.payload.data) terminal.write(event.payload.data);
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
        setIsSpawned(true);
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

      // Spawn terminal — the launch-chosen shell wins until the user switches.
      try {
        const command = launchCommand || TERMINAL_COMMANDS[selectedTerminal];
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
        if (disposed || !terminal) return;
        setIsSpawned(true);
      } catch (e) {
        if (!disposed && terminal) {
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
          theme: buildXtermThemeFromDom(),
          // Required for the transparent background above to reach the glass.
          allowTransparency: true,
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

        // No WebGL renderer here on purpose. xterm's WebGL addon does not
        // honour allowTransparency: it paints an opaque backdrop, which would
        // put a solid rectangle over the pane's glass. The canvas renderer is
        // marginally slower and is what makes a transparent terminal possible.

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
          invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        };

        const fitAndSync = () => {
          if (resizeDebounce) clearTimeout(resizeDebounce);
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
          }, 150);
        };

        // Pipe user keystrokes into the process's stdin.
        onDataDisposable = terminal.onData((data) => {
          writeToProcess(data);
        });

        // Keep the terminal fitted to its container on window resize
        handleResize = fitAndSync;
        window.addEventListener("resize", handleResize);

        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) setPaneWidth(entry.contentRect.width);
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
      if (handleResize) window.removeEventListener("resize", handleResize);
      observerRef?.disconnect();
      onDataDisposable?.dispose();

      // Dispose WebGL addon first, wrapped in try/catch
      // This is a known issue with xterm-addon-webgl: dispose() can throw
      // if the WebGL context was lost or never fully initialized
      try {
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
        // Always clear the ref even if disposal throws
        terminalInstance.current = null;
        setIsSpawned(false);
      }
    };
  }, [paneId, selectedTerminal, launchCommand, workingDir]);

  useEffect(() => {
    const onTheme = () => {
      const t = terminalInstance.current;
      if (!t) return;
      t.options.theme = buildXtermThemeFromDom();
      try {
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
        <div className="flex items-center gap-1">
          {onToggleMaximize && paneWidth >= 240 && (
            <button
              onClick={onToggleMaximize}
              className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textDim hover:text-swarm-text transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          {paneWidth >= 240 && (
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textDim hover:text-swarm-text transition-colors"
              title="Copy selection"
            >
              <Copy size={12} />
            </button>
          )}
          {paneWidth >= 240 && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textDim hover:text-swarm-text transition-colors"
              title="Clear terminal"
            >
              <Eraser size={12} />
            </button>
          )}
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

      {/* terminal content */}
      <div
        className="flex-1 overflow-hidden relative min-h-0 p-2"
        style={{ contain: "layout paint" }}
      >
        <div ref={terminalRef} className="absolute inset-2 overflow-hidden" />
      </div>
    </div>
  );
}
