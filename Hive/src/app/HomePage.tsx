"use client";

import { useState, useEffect, useRef } from "react";
import PlaneHost from "@/features/panes/PlaneHost";
import { usePlaneStore } from "@/features/panes/planeStore";
import { TaskCombPanel } from "@hiveory/taskcomb";
import { SessionHistory } from "@hiveory/nectar/ui";
import { VoiceHotkeys } from "@hiveory/bee-voice/ui";
import HiveoryLogo from "@/shared/HiveoryLogo";
import SettingsPage from "@/features/settings/SettingsPage";
import { ExtensionsMarketplace } from "@hiveory/hiveextension";
import { Blocks, Gauge } from "lucide-react";
import { useWorkerBeesStore, CliUsagePanel, type WorkerBee } from "@hiveory/worker-bees/ui";
import { getTauriAPIs, loadTauriAPIs } from "@/shared/tauri";
import { WorkHivesSidebar as ADEWorktreeSidebar } from "@hiveory/workhive/ui";
import ADERightDock from "@/features/dock/RightDock";
import { useWorkHiveStore, samePath, folderName } from "@hiveory/workhive";
import { useProjectStore } from "@hiveory/workhive";
import { useUiStore } from "@/shared/uiStore";
import { useSettingsStore } from "@/features/settings/settingsStore";
import { themeAccentHex } from "@/shared/themes";
import { useThemeStore } from "@/shared/themeStore";
import { ensureNectarMcpForProject } from "@hiveory/worker-bees/ui";
import { useQueenBridge } from "@hiveory/queenbee/ui";
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
  const [initialized, setInitialized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExtensions, setShowExtensions] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [gitStatus, setGitStatus] = useState<{
    branch: string;
    changed: number;
  } | null>(null);
  const windowRef = useRef<any>(null);

  // Sidebar state: pinned = takes flex space, unpinned = overlay.
  // Open/closed lives in uiStore so QueenBee's tools can toggle it too.
  const [leftPinned, setLeftPinned] = useState(true);
  const [rightPinned, setRightPinned] = useState(true);
  const leftOpen = useUiStore((s) => s.leftOpen);
  const rightOpen = useUiStore((s) => s.rightOpen);
  const setLeftOpen = useUiStore((s) => s.setLeftOpen);
  const setRightOpen = useUiStore((s) => s.setRightOpen);
  const toggleLeft = useUiStore((s) => s.toggleLeft);
  const toggleRight = useUiStore((s) => s.toggleRight);

  const workerBees = useWorkerBeesStore((state) => state.workerBees);
  const agentStatuses = useWorkerBeesStore((state) => state.agentStatuses);
  const refitTerminals = useWorkerBeesStore((state) => state.refitTerminals);
  const workHives = useWorkHiveStore((s) => s.workHives);
  const activeWorkHiveId = useWorkHiveStore((s) => s.activeWorkHiveId);
  const updateWorkHive = useWorkHiveStore((s) => s.updateWorkHive);
  const boardOpen = useWorkHiveStore((s) => s.boardOpen);
  const setBoardOpen = useWorkHiveStore((s) => s.setBoardOpen);
  const activeWorkHive = workHives.find((w) => w.id === activeWorkHiveId);
  // The project shown in the chrome is whatever the active workhive is bound
  // to — other workHives keep their own folders open and running behind it.
  const projectPath = activeWorkHive?.boundProjectPath || null;

  // Answer QueenBee's tool calls for as long as a project is open — the crowned
  // CLI can be talking even while its dock tab is hidden.
  useQueenBridge();

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

  useEffect(() => {
    const initializeWindow = async () => {
      try {
        const apis = await loadTauriAPIs();
        if (apis?.getCurrentWindow) {
          const window = apis.getCurrentWindow();
          windowRef.current = window;
        }
      } catch (e) {
        console.error("Failed to initialize window:", e);
      }
    };
    initializeWindow();
    setInitialized(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "b") {
        // Let a focused terminal/input keep Ctrl+B (tmux prefix, readline, etc.)
        // instead of the global dock toggle stealing it — same guard used for
        // Ctrl+C interception in WorkerBeePane.
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
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
        if (window) {
          if (isMaximized) {
            await window.unmaximize();
            setIsMaximized(false);
          } else {
            await window.maximize();
            setIsMaximized(true);
          }
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

  const handleTitleBarDoubleClick = async () => {
    await handleMaximize();
  };


  const handleFolderSelect = async (folderPath: string) => {
    // One call decides everything: reuse the hive already bound to this folder,
    // adopt the active hive if it is unbound, or start a new one named after the
    // folder — including the very first hive on a fresh install. The rule lives
    // in the WorkHive package, not here.
    useWorkHiveStore
      .getState()
      .openFolder(folderPath, themeAccentHex(useThemeStore.getState().themeId));
    try {
      const apis = getTauriAPIs();
      if (apis?.invoke) {
        await apis.invoke("ensure_nectar_structure", { projectPath: folderPath });
      }
      // Auto-wire Nectar MCP (+ approve all project MCP servers) as soon as the
      // folder is opened — not only when a WorkerBee pane spawns.
      const defaultCli = useSettingsStore.getState().defaultWorkerBee || "claude";
      await ensureNectarMcpForProject(folderPath, defaultCli);
    } catch (e) {
      console.error("Failed to initialize Nectar for folder:", e);
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
      <HiveoryLogo size={18} className="shrink-0" />
      <OverflowMenu
        items={[
          {
            id: "open",
            label: "Open project…",
            hint: "Start or switch a workhive",
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
              ? "text-bee-goldHi bg-bee-gold/10"
              : "text-bee-textMuted hover:text-bee-text hover:bg-bee-border/50"
          }`}
          title="Toggle Task Comb"
        >
          <Columns3 size={15} />
        </button>
        <button
          onClick={() => toggleLeft()}
          className="rounded-md p-1 text-bee-textMuted transition-colors hover:bg-bee-border/50 hover:text-bee-text"
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
  // and the widget would otherwise both mount the QueenBee's pane, and two
  // xterms draining one pty leaves the widget blank.
  const planeFullscreen = usePlaneStore((s) => s.fullscreen);
  const dockVisible = rightOpen && !planeFullscreen;
  const rightTakesSpace = dockVisible;

  return (
    <div className="h-screen w-screen flex flex-col text-bee-text font-sans select-none">
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
      <div
        className="fixed right-0 top-0 z-[60] flex h-11 items-center gap-1 px-2"
        data-tauri-drag-region
        onDoubleClick={handleTitleBarDoubleClick}
      >
        {/* Window controls only. Everything that acts on the app moved into
            the sidebar's overflow menu, which is why this corner is now four
            buttons instead of ten. */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleRight()}
            className={`p-1.5 rounded-md transition-colors ${
              rightOpen
                ? "text-bee-goldHi bg-bee-gold/10"
                : "text-bee-textMuted hover:text-bee-text hover:bg-bee-border/40"
            }`}
            title="Toggle right panel"
          >
            <PanelRight size={15} />
          </button>
          <div className="w-px h-4 bg-bee-border/40 mx-0.5" />
          <button
            onClick={handleMinimize}
            className="p-1.5 rounded-md hover:bg-bee-border/60 text-bee-textMuted hover:text-bee-text transition-colors"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 rounded-md hover:bg-bee-border/60 text-bee-textMuted hover:text-bee-text transition-colors"
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? <Copy size={14} /> : <Square size={14} />}
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-bee-err/80 text-bee-textMuted hover:text-white transition-colors"
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
          {workHives.length === 0 ? (
            /* Nothing is open yet. No placeholder hive, no empty grid — just the
               one action that starts everything. */
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <HiveoryLogo size={44} />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-bee-text">No workhive open</p>
                <p className="max-w-[42ch] text-xs leading-relaxed text-bee-textMuted">
                  Open a project folder to start a workhive. It keeps its own agents,
                  branches, board and memory, and remembers them next time.
                </p>
              </div>
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-1.5 rounded-lg border border-bee-gold/30 bg-bee-gold/15 px-3.5 py-1.5 text-xs font-medium text-bee-goldHi transition-colors hover:bg-bee-gold/25"
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
              // shows the mark alone (HoneyBoardStrip's showLogo).
              leading={
                leftOpen ? undefined : (
                  <button
                    onClick={() => toggleLeft()}
                    className="shrink-0 rounded-md p-1 text-bee-textMuted transition-colors hover:bg-bee-border/50 hover:text-bee-text"
                    title="Show sidebar"
                  >
                    <PanelLeft size={15} />
                  </button>
                )
              }
              // Only the centre column runs under the floating controls; when
              // the dock is open it covers that corner itself.
              reserveRight={rightOpen ? 0 : WINDOW_CONTROLS_WIDTH}
            />
          )}
          {/* Task Comb is docked to the center, outside the plane, so switching
              planes never moves it. A fullscreen plane covers it — the plane's
              floating Task Comb widget takes over there. */}
          <TaskCombPanel
            open={boardOpen}
            tasks={activeWorkHive?.taskCards ?? []}
            statuses={agentStatuses}
            onClose={() => setBoardOpen(false)}
            // TaskComb owns the boards; Nectar owns session history. Hive is the
            // only place that knows both, so it hands one to the other.
            history={
              <SessionHistory projectPath={projectPath} activeWorkHiveId={activeWorkHiveId} />
            }
          />
        </div>

        {/* Right dock — docked (takes space) when pinned, floating overlay when unpinned */}
        {dockVisible && (
          <div
            className={`${rightTakesSpace ? "relative flex-shrink-0" : "absolute right-0 top-0 bottom-0 z-40 shadow-2xl shadow-black/40"}`}
            // The dock reaches the window's top-right corner, where the
            // window controls float. Start its content below them.
            style={{ paddingTop: 44 }}
          >
            <ADERightDock
              projectPath={projectPath}
              activeWorkHiveId={activeWorkHiveId}
              pinned={rightPinned}
              onTogglePin={() => setRightPinned((p) => !p)}
              onClose={() => setRightOpen(false)}
              onOpenSettings={() => setShowSettings(true)}
              onOpenProject={handleOpenFolder}
            />
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="h-6 glass-toolbar border-t border-bee-border/60 flex items-center justify-between px-3 text-mini text-bee-textDim">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-bee-gold">
            <GitBranch size={11} />
            {gitStatus?.branch ?? "no repo"}
          </span>
          {gitStatus && gitStatus.changed > 0 && (
            <span className="text-bee-textMuted">{gitStatus.changed} changed</span>
          )}
        </div>
      </div>

      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showExtensions && <ExtensionsMarketplace onClose={() => setShowExtensions(false)} />}

      {/* Global voice hotkeys: Ctrl+Win (type anywhere) · Ctrl+Alt (WorkerBee). */}
      <VoiceHotkeys />
    </div>
  );
}
