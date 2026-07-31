"use client";

import { useState, useEffect } from "react";
import PlaneHost from "@/features/panes/PlaneHost";
import { usePlaneStore } from "@/features/panes/planeStore";
import { TasksPanel } from "@swarm/tasks";
import { SessionHistory } from "@swarm/pheromone/ui";
import { VoiceHotkeys } from "@swarm/voice/ui";
import SwarmLogo from "@/shared/SwarmLogo";
import SettingsPage from "@/features/settings/SettingsPage";
import { ExtensionsMarketplace } from "@swarm/extension";
import { Blocks, Gauge } from "lucide-react";
import { useAgentsStore, CliUsagePanel } from "@swarm/agents/ui";
import { getTauriAPIs, loadTauriAPIs } from "@/shared/tauri";
import { WorkspacesSidebar as ADEWorktreeSidebar } from "@swarm/workspace/ui";
import ADERightDock from "@/features/dock/RightDock";
import { useWorkspaceStore } from "@swarm/workspace";
import { useUiStore } from "@/shared/uiStore";
import { useSettingsStore } from "@/features/settings/settingsStore";
import { themeAccentHex } from "@/shared/themes";
import { useThemeStore } from "@/shared/themeStore";
import { ensurePheromoneMcpForProject } from "@swarm/agents/ui";
import { useLeadBridge } from "@swarm/lead/ui";
import {
  Settings,
  X,
  Minus,
  Square,
  Copy,
  FolderOpen,
  GitBranch,
  PanelLeft,
  PanelRight,
  Columns3,
} from "lucide-react";
import ThemePicker from "@/shared/ThemePicker";
import OverflowMenu from "@/shared/OverflowMenu";


/**
 * Width of the floating window-control cluster at the top right. Columns that
 * reach that corner reserve this much so nothing hides underneath it.
 */
const WINDOW_CONTROLS_WIDTH = 142;

export default function HomePage() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExtensions, setShowExtensions] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [gitStatus, setGitStatus] = useState<{
    branch: string;
    changed: number;
  } | null>(null);

  // Sidebar state: pinned = takes flex space, unpinned = overlay.
  // Open/closed lives in uiStore so Lead's tools can toggle it too.
  const [leftPinned, setLeftPinned] = useState(true);
  const leftOpen = useUiStore((s) => s.leftOpen);
  const rightOpen = useUiStore((s) => s.rightOpen);
  const setLeftOpen = useUiStore((s) => s.setLeftOpen);
  const setRightOpen = useUiStore((s) => s.setRightOpen);
  const toggleLeft = useUiStore((s) => s.toggleLeft);
  const toggleRight = useUiStore((s) => s.toggleRight);

  // Only the statuses are read here. Subscribing to the whole agents array
  // re-rendered the entire shell (and every dock/pane inside it) on each
  // agent-store tick, which is what made resizing and typing feel sticky.
  const agentStatuses = useAgentsStore((state) => state.agentStatuses);
  const refitTerminals = useAgentsStore((state) => state.refitTerminals);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const boardOpen = useWorkspaceStore((s) => s.boardOpen);
  const setBoardOpen = useWorkspaceStore((s) => s.setBoardOpen);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  // The project shown in the chrome is whatever the active agent is bound
  // to — other workspaces keep their own folders open and running behind it.
  const projectPath = activeWorkspace?.boundProjectPath || null;

  // Answer Lead's tool calls for as long as a project is open — the crowned
  // CLI can be talking even while its dock tab is hidden.
  useLeadBridge();

  useEffect(() => {
    const id = requestAnimationFrame(() => refitTerminals());
    return () => cancelAnimationFrame(id);
  }, []);

  // Native minimize/restore doesn't reliably fire a DOM resize on the
  // terminal panes, so xterm's canvas goes stale and glyphs overlap on
  // restore. Window focus (which restore always triggers) forces a refit.
  useEffect(() => {
    window.addEventListener("focus", refitTerminals);
    return () => window.removeEventListener("focus", refitTerminals);
  }, [refitTerminals]);

  // The window can be maximized without going through our button — OS snap,
  // a double-click on the drag region, a keyboard shortcut. Mirroring the real
  // state keeps the restore icon honest instead of frozen on whatever the last
  // in-app click did.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const apis = await loadTauriAPIs();
        if (!apis?.getCurrentWindow) return;
        const win = apis.getCurrentWindow();
        const sync = async () => {
          const max = await win.isMaximized();
          if (!cancelled) setIsMaximized(max);
        };
        await sync();
        unlisten = await win.onResized(sync);
        // The effect may have been torn down while onResized was in flight.
        if (cancelled) unlisten();
      } catch (e) {
        console.error("Failed to initialize window:", e);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "b") {
        // Let a focused terminal/input keep Ctrl+B (tmux prefix, readline, etc.)
        // instead of the global dock toggle stealing it — same guard used for
        // Ctrl+C interception in AgentPane. contentEditable counts too: the
        // GlassChat embed composes in one, and losing every ^B there reads as
        // the panel eating keystrokes.
        const active = document.activeElement;
        if (
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLInputElement ||
          (active instanceof HTMLElement && active.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleRight();
      }
    };

    // Dropdowns close via their own click-catcher overlay.
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMinimize = async () => {
    try {
      const apis = getTauriAPIs();
      if (apis?.getCurrentWindow) {
        const window = apis.getCurrentWindow();
        if (window) await window.minimize();
      }
    } catch (e) {
      console.error("Failed to minimize window:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const apis = getTauriAPIs();
      if (apis?.getCurrentWindow) {
        const window = apis.getCurrentWindow();
        // Toggle against the window's own state, not ours: acting on a stale
        // `isMaximized` sent the window the wrong way after an OS-side snap.
        if (window) {
          await window.toggleMaximize();
          setIsMaximized(await window.isMaximized());
        }
      }
    } catch (e) {
      console.error("Failed to toggle maximize:", e);
    }
  };

  const handleClose = async () => {
    try {
      const apis = getTauriAPIs();
      if (apis?.getCurrentWindow) {
        const window = apis.getCurrentWindow();
        if (window) await window.close();
      }
    } catch (e) {
      console.error("Failed to close window:", e);
    }
  };


  const handleFolderSelect = async (folderPath: string) => {
    // One call decides everything: reuse the swarm already bound to this folder,
    // adopt the active swarm if it is unbound, or start a new one named after the
    // folder — including the very first swarm on a fresh install. The rule lives
    // in the Workspace package, not here.
    useWorkspaceStore
      .getState()
      .openFolder(folderPath, themeAccentHex(useThemeStore.getState().themeId));
    try {
      const apis = getTauriAPIs();
      if (apis?.invoke) {
        await apis.invoke("ensure_pheromone_structure", { projectPath: folderPath });
      }
      // Auto-wire Pheromone MCP (+ approve all project MCP servers) as soon as the
      // folder is opened — not only when a Agent pane spawns.
      const defaultCli = useSettingsStore.getState().defaultAgent || "claude";
      await ensurePheromoneMcpForProject(folderPath, defaultCli);
    } catch (e) {
      console.error("Failed to initialize Pheromone for folder:", e);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const apis = getTauriAPIs();
      if (!apis?.open) return;
      const folderPath = await apis.open({ directory: true, multiple: false, title: "Open Folder" });
      if (folderPath && typeof folderPath === "string") {
        await handleFolderSelect(folderPath);
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  /**
   * The window's top-left corner, rendered inside the sidebar. Four small
   * controls: the mark, the overflow menu, and the two panel toggles. Anything
   * with a dialog or a panel behind it goes in the menu, so this row stays the
   * same width no matter how many features the app grows.
   */
  const appRow = (
    <>
      <SwarmLogo size={18} className="shrink-0" />
      <OverflowMenu
        items={[
          {
            id: "open",
            label: "Open project…",
            hint: "Start or switch a workspace",
            icon: FolderOpen,
            onSelect: handleOpenFolder,
          },
          {
            id: "extensions",
            label: "Extensions",
            hint: "Agents and tools from Open-VSX",
            icon: Blocks,
            onSelect: () => setShowExtensions(true),
          },
          {
            id: "usage",
            label: "Plan limits",
            hint: "Token usage per CLI",
            icon: Gauge,
            onSelect: () => setShowUsage(true),
          },
          {
            id: "settings",
            label: "Settings",
            hint: "API keys and defaults",
            icon: Settings,
            onSelect: () => setShowSettings(true),
          },
        ]}
      />
      <ThemePicker />
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <button
          onClick={() => setBoardOpen(!boardOpen)}
          className={`rounded-md p-1 transition-colors ${
            boardOpen
              ? "text-swarm-goldHi bg-swarm-gold/10"
              : "text-swarm-textMuted hover:text-swarm-text hover:bg-swarm-border/50"
          }`}
          title="Toggle Tasks"
        >
          <Columns3 size={15} />
        </button>
        <button
          onClick={() => toggleLeft()}
          className="rounded-md p-1 text-swarm-textMuted transition-colors hover:bg-swarm-border/50 hover:text-swarm-text"
          title="Collapse sidebar"
        >
          <PanelLeft size={15} />
        </button>
      </div>
    </>
  );

  useEffect(() => {
    if (!projectPath) { setGitStatus(null); return; }
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const apis = getTauriAPIs();
        if (!apis?.invoke) return;
        const status = await apis.invoke<{ branch: string; changed: number }>("git_status", { projectPath });
        if (!cancelled) setGitStatus(status);
      } catch { if (!cancelled) setGitStatus(null); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectPath]);

  // Pane adds live in each plane's own header now (see PlaneHost).


  // Pinned sidebars take flex space (docked); unpinned float over the content.
  const leftTakesSpace = leftPinned && leftOpen;
  // Right dock always reserves space when open — floating it over the center
  // buried the Mission Pipeline's right edge under the panel.
  // A fullscreen plane covers the dock anyway, and its floating widgets take
  // over there. Unmount it rather than leaving it hidden underneath: the dock
  // and the widget would otherwise both mount the Lead's pane, and two
  // xterms draining one pty leaves the widget blank.
  const planeFullscreen = usePlaneStore((s) => s.fullscreen);
  const dockVisible = rightOpen && !planeFullscreen;

  return (
    <div className="h-screen w-screen flex flex-col text-swarm-text font-sans select-none">
      {/*
        No window-wide title bar. The window is three columns that each start
        at the very top: sidebar, centre, dock. The centre column's first row
        IS the pane strip, which is why resizing the sidebar shifts the strip
        with it — they are one component, not a bar with panes underneath.

        Splitting them is what broke fullscreen: the strip stayed pinned to a
        bar the fullscreen plane had already covered.

        Only the app/window controls float, fixed to the window's top-right
        corner, because those belong to the window rather than to any column.
      */}
      {/*
        "deep" so the padding and the gaps between the controls drag the window
        too — a bare drag region only reacts to direct hits on itself, which
        left this whole corner dead except for the container's own few pixels.
        Buttons still click: Tauri stops the walk at any clickable element.

        No onDoubleClick either: Tauri's drag region already toggles maximize on
        double-click, so handling it again toggled it straight back — and the
        handler fired for double-clicks on the buttons as well.
      */}
      <div
        className="fixed right-0 top-0 z-[60] flex h-11 items-center gap-1 px-2"
        data-tauri-drag-region="deep"
      >
        {/* Window controls only. Everything that acts on the app moved into
            the sidebar's overflow menu, which is why this corner is now four
            buttons instead of ten. */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleRight()}
            className={`p-1.5 rounded-md transition-colors ${
              rightOpen
                ? "text-swarm-goldHi bg-swarm-gold/10"
                : "text-swarm-textMuted hover:text-swarm-text hover:bg-swarm-border/40"
            }`}
            title="Toggle right panel"
          >
            <PanelRight size={15} />
          </button>
          <div className="w-px h-4 bg-swarm-border/40 mx-0.5" />
          <button
            onClick={handleMinimize}
            className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textMuted hover:text-swarm-text transition-colors"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textMuted hover:text-swarm-text transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Copy size={14} /> : <Square size={14} />}
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-swarm-err/80 text-swarm-textMuted hover:text-white transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {showUsage && (
        <>
          <div className="fixed inset-0 z-[149]" onClick={() => setShowUsage(false)} />
          <div className="fixed left-3 top-14 z-[150] animate-fade-in">
            <CliUsagePanel onClose={() => setShowUsage(false)} />
          </div>
        </>
      )}

      {/* The three columns. Starts at the very top of the window: there is no
          bar above it. position:relative so floating (unpinned) sidebars
          anchor here. */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Left sidebar — docked (takes space) when pinned, floating overlay when unpinned */}
        {leftOpen && (
          <div className={`${leftTakesSpace ? "relative flex-shrink-0" : "absolute left-0 top-0 bottom-0 z-40 shadow-2xl shadow-black/40"}`}>
            <ADEWorktreeSidebar
              projectPath={projectPath}
              pinned={leftPinned}
              onTogglePin={() => setLeftPinned((p) => !p)}
              onClose={() => setLeftOpen(false)}
              topBar={appRow}
            />
          </div>
        )}

        {/* Main grid area — min-w-0 allows flex to shrink below children's intrinsic width when sidebars are docked */}
        <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
          {workspaces.length === 0 ? (
            /* Nothing is open yet. No placeholder swarm, no empty grid — just the
               one action that starts everything. */
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <SwarmLogo size={44} />
              <div className="space-y-1">
                {/* "a agent" was a bad find-and-replace from the rebrand: the
                    thing a folder opens is a workspace, which is what the
                    sidebar calls it too. */}
                <p className="text-sm font-semibold text-swarm-text">No workspace open</p>
                <p className="max-w-[42ch] text-xs leading-relaxed text-swarm-textMuted">
                  Open a project folder to start a workspace. It keeps its own agents,
                  branches, board and memory, and remembers them next time.
                </p>
              </div>
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-1.5 rounded-lg border border-swarm-gold/30 bg-swarm-gold/15 px-3.5 py-1.5 text-xs font-medium text-swarm-goldHi transition-colors hover:bg-swarm-gold/25"
              >
                <FolderOpen size={14} />
                Open Project
              </button>
            </div>
          ) : (
            <PlaneHost
              workingDir={projectPath}
              // The app controls live in the sidebar. The strip only needs a
              // way back when that sidebar is collapsed; in fullscreen it
              // shows the mark alone (BoardStrip's showLogo).
              leading={
                leftOpen ? undefined : (
                  <button
                    onClick={() => toggleLeft()}
                    className="shrink-0 rounded-md p-1 text-swarm-textMuted transition-colors hover:bg-swarm-border/50 hover:text-swarm-text"
                    title="Show sidebar"
                  >
                    <PanelLeft size={15} />
                  </button>
                )
              }
              // Only the centre column runs under the floating controls; when
              // the dock is open it covers that corner itself. Keyed off
              // dockVisible, not rightOpen: a fullscreen plane hides the dock
              // while rightOpen is still true, and the strip's right end was
              // sliding under the window controls there.
              reserveRight={dockVisible ? 0 : WINDOW_CONTROLS_WIDTH}
            />
          )}
          {/* Tasks is docked to the center, outside the plane, so switching
              planes never moves it. A fullscreen plane covers it — the plane's
              floating Tasks widget takes over there. */}
          <TasksPanel
            open={boardOpen}
            tasks={activeWorkspace?.taskCards ?? []}
            statuses={agentStatuses}
            onClose={() => setBoardOpen(false)}
            // Tasks owns the boards; Pheromone owns session history. Swarm is the
            // only place that knows both, so it hands one to the other.
            history={
              <SessionHistory projectPath={projectPath} activeWorkspaceId={activeWorkspaceId} />
            }
          />
        </div>

        {/* Right dock — always docked, never floating (see the note above:
            floating it buried the pipeline's right edge). The pin control it
            used to render did nothing at all, so it is gone. */}
        {dockVisible && (
          <div
            className="relative flex-shrink-0"
            // The dock reaches the window's top-right corner, where the
            // window controls float. Start its content below them.
            style={{ paddingTop: 44 }}
          >
            <ADERightDock projectPath={projectPath} onClose={() => setRightOpen(false)} />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="h-6 glass-toolbar border-t border-swarm-border/60 flex items-center justify-between px-3 text-mini text-swarm-textDim">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-swarm-gold">
            <GitBranch size={11} />
            {gitStatus?.branch ?? "no repo"}
          </span>
          {gitStatus && gitStatus.changed > 0 && (
            <span className="text-swarm-textMuted">{gitStatus.changed} changed</span>
          )}
        </div>
      </div>

      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showExtensions && <ExtensionsMarketplace onClose={() => setShowExtensions(false)} />}

      {/* Global voice hotkeys: Ctrl+Win (type anywhere) · Ctrl+Alt (Agent). */}
      <VoiceHotkeys />
    </div>
  );
}
