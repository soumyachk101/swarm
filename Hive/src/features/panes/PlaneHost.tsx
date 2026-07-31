"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Globe, Smartphone,
  Plus, Maximize2, Minimize2,
  SquareTerminal, Blocks, Search, Boxes, ChevronDown,
} from "lucide-react";
import {
  HoneyBoardLogo, HoneyBoardStrip, themeForKind, type StripItem,
  QueenCrown, BrandGlyph, cliBrand, shellBrand, WorkerBeeMark,
} from "@hiveory/honeyboard";
import { HoneyFlowCanvas, HoneyFlowMark, useCanvasStore } from "@hiveory/honeyflow";
import { OpenVsxLogo, OpenVsxPane } from "@hiveory/hiveextension";
import { invoke } from "@tauri-apps/api/core";
import { WorkerBeePane } from "@hiveory/worker-bees/ui";
import { TerminalPane } from "@hiveory/worker-bees/ui";
import BrowserPane from "@/features/browser/BrowserPane";
import EmulatorPane from "@/features/emulator/EmulatorPane";
import { QueenBeePanel, QueenModeSelect } from "@hiveory/queenbee/ui";
import { forgetSpawn } from "@hiveory/worker-bees/ui";
import { CLI_METADATA } from "@hiveory/worker-bees";
import { PipelineBoard, type TaskCard } from "@hiveory/taskcomb";
import { X, Columns3 } from "lucide-react";
import HiveoryLogo from "@/shared/HiveoryLogo";
import { useWorkerBeesStore, type WorkerBee, type GridLayout } from "@hiveory/worker-bees/ui";
import { useWorkHiveStore } from "@hiveory/workhive";
import { WorktreeSelect as WorktreeSelect, ToolboxPane } from "@hiveory/workhive/ui";
import { useExtensionStore, isAgentExtension } from "@hiveory/hiveextension";
import { extensionAgentProps } from "@/host/extensionAgent";
import {
  usePlaneStore, PLANES, planeFor, paneInPlane, type PlaneKind, type PlaneDef, type BoardView,
} from "./planeStore";
import { GRID_PRESETS, presetFor, PresetThumb } from "./gridPresets";

const INTERACTIVE = "button, input, select, textarea, a, [contenteditable], [role='button']";

const PLANE_ICON: Record<PlaneKind, React.ComponentType<{ className?: string }>> = {
  honeyboard: HoneyBoardLogo,
  browser: Globe,
  emulator: Smartphone,
};

/**
 * Every CLI and shell shows its own logo, so a pane is identifiable at a
 * glance without reading the title. Nothing here is a stand-in glyph: the
 * marks come from each vendor, via `@hiveory/honeyboard`.
 */
function cliIconNode(cliId: string | undefined, px = 14) {
  const brand = cliBrand(cliId);
  return brand ? <BrandGlyph brand={brand} size={px} /> : <WorkerBeeMark size={px} />;
}

/** Maps a detected shell's label onto the shell it actually is. */
function shellIdFor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("power") || l.includes("pwsh")) return "powershell";
  if (l.includes("cmd") || l.includes("command prompt")) return "cmd";
  if (l.includes("bash") || l.includes("git")) return "git-bash";
  if (l.includes("wsl") || l.includes("ubuntu") || l.includes("linux")) return "wsl";
  return "";
}

function shellIconNode(label: string, px = 14) {
  const brand = shellBrand(shellIdFor(label));
  return brand ? <BrandGlyph brand={brand} size={px} /> : <SquareTerminal style={{ width: px, height: px }} />;
}

/** Icon node for a pane (CLI agent by command, a terminal, or an extension). */
function paneIconNode(bee: WorkerBee, cls = "size-3") {
  const px = cls === "size-3" ? 12 : 14;
  if (bee.kind === "shell") return shellIconNode(bee.customName ?? bee.cliName ?? bee.cli, px);
  if (bee.kind === "openvsx")
    return bee.iconUrl ? <img src={bee.iconUrl} alt="" className={`${cls} rounded-sm object-contain`} /> : <OpenVsxLogo className={cls} />;
  const meta = CLI_METADATA.find((c) => c.command === bee.cli);
  return cliIconNode(meta?.id, px);
}

interface Props {
  workingDir?: string | null;
  /** App controls for the strip's left end (mark + sidebar toggles). This
   *  column's first row is the top of the window; nothing sits above it. */
  leading?: React.ReactNode;
  /** Width the floating window controls occupy at the top right. */
  reserveRight?: number;
}

export default function PlaneHost({ workingDir, leading, reserveRight }: Props) {
  const workerBees = useWorkerBeesStore((s) => s.workerBees);
  const addWorkerBee = useWorkerBeesStore((s) => s.addWorkerBee);
  const setAgentStatus = useWorkerBeesStore((s) => s.setAgentStatus);
  const removeWorkerBee = useWorkerBeesStore((s) => s.removeWorkerBee);
  const updateWorkerBee = useWorkerBeesStore((s) => s.updateWorkerBee);
  const maximizedPane = useWorkerBeesStore((s) => s.maximizedPane);
  const setMaximizedPane = useWorkerBeesStore((s) => s.setMaximizedPane);
  const reorderWorkerBees = useWorkerBeesStore((s) => s.reorderWorkerBees);
  const swapWorkerBees = useWorkerBeesStore((s) => s.swapWorkerBees);
  const refitTerminals = useWorkerBeesStore((s) => s.refitTerminals);
  const gridLayout = useWorkerBeesStore((s) => s.gridLayout);
  const setGridLayout = useWorkerBeesStore((s) => s.setGridLayout);
  const agentStatuses = useWorkerBeesStore((s) => s.agentStatuses);

  const workHives = useWorkHiveStore((s) => s.workHives);
  const activeWorkHiveId = useWorkHiveStore((s) => s.activeWorkHiveId);
  const updateWorkHive = useWorkHiveStore((s) => s.updateWorkHive);
  const activeWorkHive = workHives.find((w) => w.id === activeWorkHiveId);

  const active = usePlaneStore((s) => s.active);
  const setActive = usePlaneStore((s) => s.setActive);
  const view = usePlaneStore((s) => s.view);
  const setView = usePlaneStore((s) => s.setView);
  const fullscreen = usePlaneStore((s) => s.fullscreen);
  const toggleFullscreen = usePlaneStore((s) => s.toggleFullscreen);
  const plane = planeFor(active);
  // Only the board plane has two geometries; browser and emulator are grids.
  const canvasView = plane.kind === "honeyboard" && view === "flow" && !maximizedPane;

  const [editingBee, setEditingBee] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [shells, setShells] = useState<{ id: string; label: string; command: string }[]>([]);
  const [focusedPane, setFocusedPane] = useState<string | null>(null);
  // Spotlight in Focus layouts — chosen by clicking a pane body, NOT by focus,
  // so clicking a pane's own buttons (e.g. delete) never reshuffles the grid.
  const [spotlightSel, setSpotlightSel] = useState<string | null>(null);

  // ── pointer-based pane drag (HTML5 DnD can't cross terminal/webview panes) ──
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; name: string } | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [over, setOver] = useState<
    { kind: "snap"; id: GridLayout } | { kind: "pane"; id: string } | null
  >(null);
  const pending = useRef<{ id: string; name: string; x: number; y: number } | null>(null);
  const dragId = useRef<string | null>(null);

  const hitTest = (x: number, y: number) => {
    const root = rootRef.current;
    if (!root) return null;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-snap]"))) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
        return { kind: "snap" as const, id: el.dataset.snap as GridLayout };
    }
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-pane-id]"))) {
      const id = el.dataset.paneId!;
      if (id === dragId.current) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
        return { kind: "pane" as const, id };
    }
    return null;
  };

  const onDragMove = (e: MouseEvent) => {
    const p = pending.current;
    setPointer({ x: e.clientX, y: e.clientY });
    if (p && !dragId.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      dragId.current = p.id;
      setDrag({ id: p.id, name: p.name });
    }
    if (dragId.current) setOver(hitTest(e.clientX, e.clientY));
  };
  const onDragUp = (e: MouseEvent) => {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragUp);
    if (dragId.current) {
      const o = hitTest(e.clientX, e.clientY);
      if (o?.kind === "snap") setGridLayout(o.id);
      else if (o?.kind === "pane") {
        // Drop onto another pane = SWAP their positions (works in every grid,
        // Focus included: swapping into slot 0 makes that pane the spotlight).
        const from = workerBees.findIndex((b) => b.id === dragId.current);
        const to = workerBees.findIndex((b) => b.id === o.id);
        if (from >= 0 && to >= 0) swapWorkerBees(from, to);
      }
    }
    pending.current = null;
    dragId.current = null;
    setDrag(null);
    setOver(null);
  };
  const onPaneMouseDown = (e: React.MouseEvent, bee: WorkerBee) => {
    const t = e.target as HTMLElement;
    // Buttons/inputs handle themselves — never promote or drag from them, so a
    // pane's delete button works even in Focus mode.
    if (e.button !== 0 || t.closest(INTERACTIVE)) return;
    // A plain click must NOT change the spotlight — the spotlight only moves when
    // a pane is dragged and dropped onto another (positions swap). Otherwise
    // clicking anywhere in a pane would reshuffle the Focus grid.
    if (maximizedPane || !t.closest("[data-pane-drag]")) return;
    pending.current = { id: bee.id, name: bee.customName || bee.cliName, x: e.clientX, y: e.clientY };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragUp);
  };

  /* ── workhive sync ─────────────────────────────────────────────
     None needed: every workhive's panes live in the pane store at once and
     are filtered by workHiveId below. Swapping the array on switch used to
     unmount the other folder's agents and respawn them on return. */
  useEffect(() => {
    const id = requestAnimationFrame(() => refitTerminals());
    return () => cancelAnimationFrame(id);
  }, [gridLayout, active, fullscreen]);

  useEffect(() => {
    invoke("detect_shells").then((s: any) => setShells(Array.isArray(s) ? s : [])).catch(() => {});
  }, []);

  // Shut down the shared CDP browser when no browser panes remain.
  const browserCount = workerBees.filter((b) => b.kind === "browser").length;
  useEffect(() => {
    if (browserCount === 0) invoke("stop_cdp_browser").catch(() => {});
  }, [browserCount]);

  /* ── plane items ────────────────────────────────────────────── */
  // This folder's panes only; the QueenBee leaves the grid for the dock tab.
  // Other workHives' panes stay mounted-but-unrendered — their agents keep
  // running while you work in another folder.
  const items = workerBees.filter(
    (b) => b.workHiveId === activeWorkHiveId && !b.isQueen && paneInPlane(b, plane),
  );

  /* ── adds (into the active plane) ─────────────────────────────
     addWorkerBee stamps the active workhive on the pane and the store
     persists itself, so nothing extra to save here. */
  const addAgent = (cli: string, name: string) => {
    const bee: WorkerBee = { id: `bee-${Date.now()}`, cli, cliName: name };
    addWorkerBee(bee); setAgentStatus(bee.id, "launching");
  };
  const addShell = (shell?: { label: string; command: string }) => {
    const bee: WorkerBee = {
      id: `terminal-${Date.now()}`, cli: shell?.command ?? "shell",
      cliName: shell?.label ?? "Terminal", kind: "shell",
    };
    addWorkerBee(bee);
  };
  // `plane` records where the pane was added from, because a browser is legal
  // in both HoneyBoard and the Browser plane (see paneInPlane).
  const addBrowser = (plane: PlaneKind = "browser") => {
    const bee: WorkerBee = {
      id: `browser-${Date.now()}`, cli: "browser", cliName: "Browser", kind: "browser", plane,
    };
    addWorkerBee(bee);
  };
  const addToolbox = () => {
    const bee: WorkerBee = {
      id: `toolbox-${Date.now()}`, cli: "toolbox", cliName: "Toolbox", kind: "toolbox", plane: "honeyboard",
    };
    addWorkerBee(bee);
  };
  const addEmulator = () => {
    const bee: WorkerBee = {
      id: `emulator-${Date.now()}`, cli: "emulator", cliName: "Emulator",
      kind: "emulator", plane: "honeyboard",
    };
    addWorkerBee(bee);
  };
  const addOpenVsx = (ext?: { id: string; name: string; icon?: string }) => {
    const bee: WorkerBee = {
      id: `openvsx-${Date.now()}`, cli: "openvsx", cliName: ext?.name || "HiveExtension", kind: "openvsx",
      extensionId: ext?.id, iconUrl: ext?.icon,
      // Claude Code, Kilo Code and OpenChamber are agents: they join the hive
      // like WorkerBees and may be crowned. Tool extensions are just panes.
      agentExt: isAgentExtension(ext?.id),
    };
    addWorkerBee(bee);
  };

  // Panes whose `kind` marks them as something other than a live CLI-agent
  // session — these don't run a stateful agent, so closing them needs no
  // confirmation. Anything else (kind undefined, rendered via WorkerBeePane)
  // is a running bee and can lose real work if killed by accident.
  const NON_AGENT_KINDS = new Set(["shell", "browser", "toolbox", "emulator", "openvsx"]);
  const handleRemove = (id: string) => {
    const bee = workerBees.find((b) => b.id === id);
    const isAgentPane = !!bee && !NON_AGENT_KINDS.has(bee.kind ?? "");
    if (isAgentPane && !window.confirm("Close this agent? Its running session will be killed.")) return;
    // A real close kills the pty, so drop the reattach record with it — and
    // the pane's canvas geometry, which nothing else will ever collect.
    forgetSpawn(id);
    useCanvasStore.getState().removeNode(id);
    invoke("kill_terminal", { paneId: id }).finally(() => removeWorkerBee(id));
  };
  const toggleMaximize = (id: string) => {
    setMaximizedPane(maximizedPane === id ? null : id);
    requestAnimationFrame(() => refitTerminals());
  };
  const startRename = (id: string) => {
    const bee = workerBees.find((b) => b.id === id);
    if (bee) { setEditingBee(id); setEditValue(bee.customName || bee.cliName); }
  };
  const saveRename = () => {
    if (editingBee) { updateWorkerBee(editingBee, { customName: editValue }); setEditingBee(null); setEditValue(""); }
  };
  const cancelRename = () => { setEditingBee(null); setEditValue(""); };

  /* ── grid sizing (scoped to this plane's items) ─────────────────
     Column presets (rows-per-page = 1): N columns, each row full plane
       height → panes stay big, scroll past N.
     Grid presets  (rows-per-page = M): N cols × M rows fill one screen;
       extra panes scroll below.
     Whenever the content overflows, all rows shrink by PEEK so the next
     row's titlebar peeks and the user knows to scroll (point 8).
     Row height is expressed in cqh (1% of the plane body's height — the body
     is a size container), so it's exact in both docked and fullscreen modes
     without measuring anything. */
  const GAP = 8;      // grid gap (gap-2)
  const PEEK = 34;    // peeked titlebar height when scrolling
  const count = items.length;

  // Maximized-pane overlay top offset: must match whichever header is
  // actually showing above it. The board plane's header is the HoneyBoardStrip
  // (44px, was hardcoded as `top-11`); every other plane uses the `h-9`
  // (36px) toolbar rendered below. Keep this in sync with that className.
  const maximizedTop = active === "honeyboard" ? 44 : 36;

  /**
   * One pane, whichever view is showing. The grid wraps this in a slot and the
   * canvas wraps it in a node; the pane itself must not know the difference, or
   * switching views would tear down every terminal and browser in the workhive.
   */
  const renderPane = (bee: WorkerBee, isThisMax: boolean) => {
    // Route this agent/terminal to its chosen worktree dir (undefined
    // worktreeId = the workhive's main path). Changing it respawns.
    const beeTree = activeWorkHive?.worktrees?.find((t) => t.id === bee.worktreeId);
    const beeDir = beeTree?.path ?? workingDir;
    const treeSelect = (
      <WorktreeSelect
        trees={activeWorkHive?.worktrees ?? []}
        value={bee.worktreeId}
        onChange={(id) => updateWorkerBee(bee.id, { worktreeId: id })}
      />
    );
    const close = () => handleRemove(bee.id);
    const max = () => toggleMaximize(bee.id);

    if (bee.kind === "emulator")
      return <EmulatorPane onClose={close} onToggleMaximize={max} isMaximized={isThisMax} />;
    if (bee.kind === "openvsx")
      return (
        <OpenVsxPane
          paneId={bee.id} workingDir={workingDir}
          tabName={bee.customName || bee.cliName} extensionId={bee.extensionId}
          onClose={close} onToggleMaximize={max} isMaximized={isThisMax}
          {...extensionAgentProps(bee, workerBees)}
        />
      );
    if (bee.kind === "browser")
      return <BrowserPane paneId={bee.id} initialUrl={bee.url} onClose={close} onToggleMaximize={max} isMaximized={isThisMax} />;
    if (bee.kind === "toolbox")
      return <ToolboxPane paneId={bee.id} onClose={close} onToggleMaximize={max} isMaximized={isThisMax} />;
    if (bee.kind === "shell")
      return (
        <TerminalPane
          paneId={bee.id} workingDir={beeDir}
          tabName={bee.customName || bee.cliName}
          shellCommand={bee.cli !== "shell" ? bee.cli : undefined}
          shellLabel={bee.cliName}
          onRename={editingBee === bee.id ? saveRename : () => startRename(bee.id)}
          isEditing={editingBee === bee.id} editValue={editValue}
          onEditChange={setEditValue} onCancelRename={cancelRename}
          onClose={close} onToggleMaximize={max} isMaximized={isThisMax}
          headerExtra={treeSelect}
        />
      );
    return (
      <WorkerBeePane
        paneId={bee.id} workingDir={beeDir} workerBee={bee}
        onRename={editingBee === bee.id ? saveRename : () => startRename(bee.id)}
        isEditing={editingBee === bee.id} editValue={editValue}
        onEditChange={setEditValue} onCancelRename={cancelRename}
        onClose={close} onToggleMaximize={max} isMaximized={isThisMax}
        headerExtra={treeSelect}
        sharedMemoryDir={activeWorkHive?.boundProjectPath || workingDir}
      />
    );
  };
  const preset = presetFor(gridLayout);
  const colsFor = (): number => {
    if (count <= 1) return 1;
    if (preset) return Math.max(1, Math.min(preset.cols, count));
    switch (gridLayout) {
      case "rows": return 1;
      case "cols": return count;
      case "grid": return Math.ceil(Math.sqrt(count));
      case 1: case 2: case 3: case 4: return Math.min(gridLayout, count);
      default: return count <= 2 ? 2 : count <= 6 ? 3 : 4;
    }
  };
  const isMaster = gridLayout === "master" && !maximizedPane && count > 1;
  const focusMode = !!preset?.focus && !maximizedPane && count > 0;
  const focus4 = gridLayout === "focus4";
  // Focus renders on a 12-track grid (divisible by 3 and 4) so the spotlight +
  // side block up top and the 4-column overflow block below all line up.
  const cols = focusMode ? 12 : colsFor();

  // rows visible per screen, and how many rows the content actually needs.
  // Focus: 2 rows up top (spotlight height); panes 4+ overflow into a 4×2 grid
  // below (4 per row), scrolling.
  const rowsPerPage = focusMode ? 2 : preset?.rows ?? 1;
  const totalRows = focusMode
    ? 2 + Math.ceil(Math.max(0, count - 3) / 4)
    : Math.max(1, Math.ceil(count / cols));
  const overflow = totalRows > rowsPerPage;
  const subtract = (overflow ? PEEK : 0) + GAP * (rowsPerPage - 1);
  const rowVal = `max(140px, calc((100cqh - ${subtract}px) / ${rowsPerPage}))`;
  // How many panes sit below the visible rows — the PEEK sliver alone is easy
  // to miss with several panes open, so surface the count next to it too.
  const hiddenCount = !overflow ? 0 : focusMode ? count - 3 : Math.max(0, count - cols * rowsPerPage);

  // Focus placement: spotlight (focused, else first) fills cols 1–2 (of the
  // preset's split); the next two panes fill the remaining top columns as full
  // rows; panes 4+ flow into a 4-wide grid below (each spans 3 of 12 tracks).
  const spotlightId = focusMode
    ? (items.some((b) => b.id === spotlightSel) ? spotlightSel : items[0]?.id)
    : null;
  const focusPlace = new Map<string, React.CSSProperties>();
  if (focusMode) {
    const split = focus4 ? 7 : 9; // spotlight occupies cols 1..split-1
    let c = 0; // index among non-spotlight panes
    for (const b of items) {
      if (b.id === spotlightId) {
        focusPlace.set(b.id, { gridColumn: `1 / ${split}`, gridRow: "1 / 3" });
      } else if (c === 0) {
        focusPlace.set(b.id, { gridColumn: `${split} / 13`, gridRow: "1" });
        c++;
      } else if (c === 1) {
        focusPlace.set(b.id, { gridColumn: `${split} / 13`, gridRow: "2" });
        c++;
      } else {
        const k = c - 2;
        focusPlace.set(b.id, { gridColumn: `${1 + (k % 4) * 3} / span 3`, gridRow: `${3 + Math.floor(k / 4)}` });
        c++;
      }
    }
  }

  const gridStyle = maximizedPane
    ? { gridTemplateColumns: "1fr", gridTemplateRows: "1fr", height: "100%" }
    : isMaster
    ? { gridTemplateColumns: "1.7fr 1fr", gridTemplateRows: `repeat(${count - 1}, minmax(180px, 1fr))`, gridAutoFlow: "row" as const }
    : preset
    ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: rowVal }
    : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(240px, 1fr)" };

  const Icon = PLANE_ICON[active];

  // Chips for the HoneyBoard strip — one per open component.
  const stripItems: StripItem[] = items.map((b) => ({
    id: b.id,
    name: b.customName || b.cliName,
    kind: b.kind ?? "agent",
    icon: paneIconNode(b),
  }));

  return (
    <div
      ref={rootRef}
      className={
        fullscreen
          ? "fixed inset-0 z-[100] flex flex-col app-canvas"
          : "flex-1 flex flex-col glass-inset relative min-w-0"
      }
    >
      {/* ── Board header ──────────────────────────────────────────────
          The strip of open panes is this column's FIRST ROW, not a separate
          window title bar. That is what makes resizing the sidebar shift the
          strip with it, and what keeps the strip attached to its panes when
          the plane goes fullscreen.

          relative z-30: panes use backdrop-blur (own stacking contexts), so
          without this the add dropdown paints *behind* them. */}
      {active === "honeyboard" ? (
        <div className="relative z-30 shrink-0">
          <HoneyBoardStrip
            items={stripItems}
            activeId={spotlightSel ?? focusedPane}
            showLogo={fullscreen}
            onSelect={(id) => {
              // Only scroll to + highlight the pane — do NOT move the Focus
              // spotlight. Spotlight changes exclusively via drag-swap.
              setFocusedPane(id);
              rootRef.current?.querySelector(`[data-pane-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
            }}
            onClose={(id) => handleRemove(id)}
            onAdd={() => setShowAdd((v) => !v)}
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
            logoNode={<HiveoryLogo size={20} className="shrink-0" />}
            viewToggle={<ViewToggle view={view} onChange={setView} />}
            leading={leading}
            reserveRight={fullscreen ? 0 : reserveRight}
          />
          {showAdd && (
            <div className="absolute left-2 top-full z-50">
              <PlaneAddMenu
                plane={plane}
                shells={shells}
                onAgent={(id, name) => { addAgent(id, name); setShowAdd(false); }}
                onShell={(s) => { addShell(s); setShowAdd(false); }}
                onBrowser={() => { addBrowser(plane.kind); setShowAdd(false); }}
                onToolbox={() => { addToolbox(); setShowAdd(false); }}
                onEmulator={() => { addEmulator(); setShowAdd(false); }}
                onOpenVsx={(ext) => { addOpenVsx(ext); setShowAdd(false); }}
                onClose={() => setShowAdd(false)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="relative z-30 flex h-9 shrink-0 items-center gap-2 border-b border-bee-border/50 glass-toolbar px-2.5">
          {fullscreen && <HiveoryLogo size={20} className="shrink-0" />}
          <Icon className="size-3.5 shrink-0 text-bee-gold" />
          <span className="text-xs font-semibold text-bee-text">{plane.label}</span>
          <span className="text-micro text-bee-textMuted">{count > 0 ? `${count} open` : ""}</span>

          <div className="relative ml-1">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-0.5 rounded-md border border-bee-gold/25 bg-bee-gold/10 px-1.5 py-0.5 text-micro font-medium text-bee-goldHi transition-colors hover:bg-bee-gold/20"
              title={`Add to ${plane.label}`}
            >
              <Plus className="size-3" />
            </button>
            {showAdd && (
              <PlaneAddMenu
                plane={plane}
                shells={shells}
                onAgent={(id, name) => { addAgent(id, name); setShowAdd(false); }}
                onShell={(s) => { addShell(s); setShowAdd(false); }}
                onBrowser={() => { addBrowser(plane.kind); setShowAdd(false); }}
                onToolbox={() => { addToolbox(); setShowAdd(false); }}
                onEmulator={() => { addEmulator(); setShowAdd(false); }}
                onOpenVsx={(ext) => { addOpenVsx(ext); setShowAdd(false); }}
                onClose={() => setShowAdd(false)}
              />
            )}
          </div>

          <div className="ml-auto">
            <button
              onClick={toggleFullscreen}
              className="rounded p-1 text-bee-textMuted transition-colors hover:bg-black/20 hover:text-bee-text"
              title={fullscreen ? "Restore" : "Maximize plane"}
            >
              {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Drag-to-top snap picker ──────────────────────────────────
          While a pane is being dragged, a Windows-snap-style strip sits at
          the top; moving the cursor onto a tile highlights it and releasing
          applies that grid. Hit-testing is geometric (see hitTest) so it also
          works over terminal/webview panes and in fullscreen. */}
      {drag && (
        <div className="pointer-events-none absolute inset-x-0 top-9 z-[60] flex justify-center px-4 pt-3">
          <div className="flex items-end gap-2 rounded-2xl border border-bee-border/60 glass-hi px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md animate-fade-in">
            {/* A preset needs at least `cols` panes (2 for Focus, which is a
                spotlight + one other) to look like anything but a smaller
                preset — e.g. "4 columns" with 2 panes open is meaningless. */}
            {GRID_PRESETS.filter((p) => count >= (p.focus ? 2 : p.cols)).map((p) => {
              const hot = over?.kind === "snap" && over.id === p.id;
              return (
                <div
                  key={p.id}
                  data-snap={p.id}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                    hot ? "bg-bee-gold/20 scale-105" : ""
                  }`}
                >
                  <PresetThumb cols={p.cols} rows={p.rows ?? 1} focus={p.focus} focusWide={p.id === "focus4"} active={hot || gridLayout === p.id} size={46} />
                  <span className={`text-micro font-medium ${hot ? "text-bee-goldHi" : "text-bee-textMuted"}`}>{p.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Plane body ───────────────────────────────────────────────
          Two different containers, because the two views need opposite things.

          Board: a `container-type: size` scroll box, so grid rows can size
          themselves in `cqh` units.

          Flow: a plain positioning context that does NOT scroll. The canvas
          owns its own panning, and `container-type: size` applies
          `contain: size`, which would stop it inheriting a height at all —
          with every node absolutely positioned the canvas then measured zero
          tall and rendered nothing. */}
      <div
        style={canvasView ? undefined : { containerType: "size" }}
        className={
          canvasView
            ? "relative min-h-0 flex-1 overflow-hidden"
            : "relative flex-1 min-h-0 p-2 overflow-auto scrollbar-sleek"
        }
        onWheel={(e) => {
          if (canvasView || !e.shiftKey) return;
          const el = e.currentTarget;
          if (el.scrollHeight > el.clientHeight) el.scrollTop += e.deltaY;
          else if (el.scrollWidth > el.clientWidth) el.scrollLeft += e.deltaY;
        }}
      >
        {canvasView ? (
          /* Same panes as the board, placed in space instead of slots. The
             canvas renders even when empty: its surface is the invitation. */
          <HoneyFlowCanvas
            hiveId={activeWorkHiveId || "default"}
            items={items.map((bee) => ({ id: bee.id, content: renderPane(bee, maximizedPane === bee.id) }))}
            onZoomSettled={refitTerminals}
            emptyState={<PlaneEmpty plane={plane} onAdd={() => setShowAdd(true)} />}
          />
        ) : count === 0 ? (
          <PlaneEmpty plane={plane} onAdd={() => setShowAdd(true)} />
        ) : (
          <div className="grid gap-2" style={gridStyle}>
            {items.map((bee) => {
              const isThisMax = maximizedPane === bee.id;
              const shouldHide = maximizedPane !== null && !isThisMax;
              return (
                <div
                  key={bee.id}
                  data-pane-id={bee.id}
                  onMouseDown={(e) => onPaneMouseDown(e, bee)}
                  onFocusCapture={() => setFocusedPane(bee.id)}
                  onBlurCapture={() => setFocusedPane((cur) => (cur === bee.id ? null : cur))}
                  className={`flex flex-col overflow-hidden glass shadow-glass hover:shadow-glass-lg ${
                    isThisMax
                      ? "fixed left-0 right-0 bottom-6 z-50 rounded-none shadow-2xl shadow-black/60"
                      : shouldHide
                      ? "hidden"
                      : "relative h-full rounded-lg border-t-2 transition-all duration-300"
                  } ${drag?.id === bee.id ? "opacity-30 scale-[0.98]" : ""} ${
                    over?.kind === "pane" && over.id === bee.id ? "ring-2 ring-bee-gold/70" : ""
                  } ${focusedPane === bee.id && !isThisMax ? "pane-active" : ""}`}
                  style={
                    isThisMax
                      ? { top: maximizedTop }
                      : !shouldHide
                      ? {
                          // Same top edge for every class — class identity is the
                          // strip/header dot only. Accent only while a drop targets it.
                          borderTopColor: over?.kind === "pane" && over.id === bee.id
                            ? themeForKind(bee.kind).accent
                            : "rgb(var(--bee-border))",
                          ...(focusMode ? focusPlace.get(bee.id) : null),
                        }
                      : undefined
                  }
                >
                  {renderPane(bee, isThisMax)}
                </div>
              );
            })}
          </div>
        )}

        {/* Overflow hint — the PEEK sliver alone (~34px of the next row's
            titlebar) is easy to miss with several panes open, so also call
            out how many are below. */}
        {!canvasView && overflow && hiddenCount > 0 && (
          <div className="pointer-events-none sticky inset-x-0 bottom-1 z-20 flex justify-center">
            <span className="pointer-events-none flex items-center gap-1 rounded-full border border-bee-gold/40 glass-hi px-2 py-0.5 text-micro font-medium text-bee-goldHi shadow-lg">
              <ChevronDown className="size-3" />
              {hiddenCount} more below
            </span>
          </div>
        )}
      </div>

      {/* Drag ghost — a small label chip following the cursor while dragging. */}
      {drag && (
        <div
          className="pointer-events-none fixed z-[70] flex items-center gap-1.5 rounded-lg border border-bee-gold/50 glass-hi px-2.5 py-1 text-mini font-medium text-bee-goldHi shadow-xl shadow-black/50"
          style={{ left: pointer.x + 14, top: pointer.y + 14 }}
        >
          <Icon className="size-3.5" />
          {drag.name}
        </div>
      )}

      {/* Fullscreen hides the docked Task Comb + QueenBee dock, so offer both as
          floating widgets: QueenBee bottom-right, Task Comb bottom-left. */}
      {fullscreen && (
        <FullscreenWidgets
          tasks={activeWorkHive?.taskCards ?? []}
          statuses={agentStatuses}
        />
      )}
    </div>
  );
}

/* ── plane switcher for the title bar ─────────────────────────── */

/* ── add menu ─────────────────────────────────────────────────── */
function PlaneAddMenu({
  plane, shells, onAgent, onShell, onBrowser, onToolbox, onEmulator, onOpenVsx, onClose,
}: {
  plane: PlaneDef;
  shells: { id: string; label: string; command: string }[];
  onAgent: (id: string, name: string) => void;
  onShell: (s: { label: string; command: string }) => void;
  onBrowser: () => void;
  onToolbox: () => void;
  onEmulator: () => void;
  onOpenVsx: (ext: { id: string; name: string; icon?: string }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const extensions = useExtensionStore((s) => s.installed);
  const has = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  // Board menu: unified gold theme, a search box, top 4 per category.
  if (plane.kind === "honeyboard") {
    const agents = CLI_METADATA.filter((c) => has(c.name) || has(c.command)).slice(0, 4);
    const terms = shells.filter((s) => has(s.label)).slice(0, 4);
    const exts = extensions.filter((e) => has(e.name) || has(e.publisher)).slice(0, 4);
    // Panes that are not an agent, a terminal or an extension, but still belong
    // on the board: a preview next to the agent building it, and the toolbox
    // that arms every bee in the hive.
    const tools = [
      { key: "browser", title: "Browser", subtitle: "localhost preview", icon: Globe, onClick: onBrowser },
      { key: "emulator", title: "Android Emulator", subtitle: "run an AVD", icon: Smartphone, onClick: onEmulator },
      { key: "toolbox", title: "Toolbox", subtitle: "skills + MCP for every bee", icon: Boxes, onClick: onToolbox },
    ].filter((t) => has(t.title) || has(t.subtitle));
    return (
      <>
        <div className="fixed inset-0 z-40" onClick={onClose} />
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl glass-hi p-1.5 animate-fade-in">
          <div className="mb-1 flex h-7 items-center gap-1.5 rounded-md border border-bee-border/60 glass-inset px-2 focus-within:border-bee-gold/50">
            <Search className="size-3 text-bee-textMuted" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search components…"
              className="min-w-0 flex-1 bg-transparent text-mini text-bee-text outline-none placeholder:text-bee-textMuted/60"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-sleek">
            {terms.length > 0 && <MenuLabel>Terminals</MenuLabel>}
            {terms.map((s) => (
              <MenuItem key={s.id} onClick={() => onShell(s)} iconNode={shellIconNode(s.label)} title={s.label} />
            ))}
            {agents.length > 0 && <MenuLabel>WorkerBees</MenuLabel>}
            {agents.map((c) => (
              // Spawn by the shell command ("claude"), not the slug id.
              <MenuItem key={c.id} onClick={() => onAgent(c.command, c.name)}
                iconNode={cliIconNode(c.id)} title={c.name} subtitle={c.command} />
            ))}
            {exts.length > 0 && <MenuLabel>Extensions</MenuLabel>}
            {exts.map((e) => (
              <MenuItem key={e.id} onClick={() => onOpenVsx({ id: e.id, name: e.name, icon: e.icon })}
                iconNode={e.icon ? <img src={e.icon} alt="" className="size-4 rounded-sm object-contain" /> : undefined}
                icon={Blocks} title={e.name} subtitle={e.publisher} />
            ))}
            {tools.length > 0 && <MenuLabel>Workspace</MenuLabel>}
            {tools.map((t) => (
              <MenuItem key={t.key} onClick={t.onClick} icon={t.icon} title={t.title} subtitle={t.subtitle} />
            ))}
            {terms.length + agents.length + exts.length + tools.length === 0 && (
              <div className="px-2.5 py-3 text-center text-mini text-bee-textMuted">No matches.</div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 max-h-[70vh] min-w-52 overflow-y-auto scrollbar-sleek rounded-xl glass-hi p-1 animate-fade-in">
        {plane.kind === "browser" && (
          <MenuItem onClick={onBrowser} icon={Globe} title="New browser pane" subtitle="localhost preview" />
        )}
        {plane.kind === "emulator" && (
          <MenuItem onClick={onEmulator} icon={Smartphone} title="New emulator pane" subtitle="Android AVDs" />
        )}
      </div>
    </>
  );
}

/**
 * Board or Flow. A segmented control rather than a single toggle button,
 * because both states are destinations the user picks between — a lone button
 * would leave you guessing whether the icon shows where you are or where
 * you'd go.
 */
function ViewToggle({ view, onChange }: { view: BoardView; onChange: (v: BoardView) => void }) {
  const opts: { id: BoardView; label: string; hint: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: "board", label: "Board", hint: "Every pane in equal slots", Icon: HoneyBoardLogo },
    { id: "flow", label: "Flow", hint: "Place panes freely on an infinite canvas", Icon: HoneyFlowMark },
  ];
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg glass-inset p-0.5" role="group" aria-label="Layout">
      {opts.map(({ id, label, hint, Icon }) => {
        const on = view === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={`${label} — ${hint}`}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-mini font-medium transition-colors ${
              on
                ? "bg-bee-gold/18 text-bee-goldHi shadow-[inset_0_1px_0_0_rgb(var(--bee-text)/0.10)]"
                : "text-bee-textMuted hover:bg-bee-border/40 hover:text-bee-text"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-0.5 pt-1.5 text-micro font-semibold uppercase tracking-wider text-bee-gold">{children}</div>;
}
function MenuItem({ onClick, title, subtitle, icon: Icon = Plus, iconNode }: { onClick: () => void; title: string; subtitle?: string; icon?: React.ComponentType<{ className?: string }>; iconNode?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-bee-textDim transition-colors hover:bg-bee-border/50 hover:text-bee-text">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-bee-gold">
        {iconNode ?? <Icon className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {subtitle && <span className="block truncate text-micro text-bee-textMuted">{subtitle}</span>}
      </span>
    </button>
  );
}

/* ── empty + placeholder states ───────────────────────────────── */
function PlaneEmpty({ plane, onAdd }: { plane: PlaneDef; onAdd: () => void }) {
  const Icon = PLANE_ICON[plane.kind];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center animate-fade-in">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-bee-gold/10">
        <Icon className="size-6 text-bee-gold" />
      </div>
      <div className="text-sm font-medium text-bee-textDim">No {plane.label.toLowerCase()} open</div>
      <button
        onClick={onAdd}
        className="rounded-lg border border-bee-gold/25 bg-bee-gold/10 px-3 py-1 text-mini font-medium text-bee-goldHi transition-colors hover:bg-bee-gold/20"
      >
        Add {plane.label}
      </button>
    </div>
  );
}

/* ── floating widgets shown when a plane is fullscreen ────────── */
function FullscreenWidgets({ tasks, statuses }: { tasks: TaskCard[]; statuses: Record<string, string> }) {
  const [open, setOpen] = useState<"none" | "queen" | "comb">("none");
  // Portalled to <body>. A fullscreen plane is itself `fixed z-[100]` inside an
  // `overflow-hidden` column, so anything rendered in place inherits that
  // stacking context and clip — these floaters must escape both.
  return createPortal(
    <>
      {/* Task Comb — bottom-left */}
      {open === "comb" && (
        <div className="fixed bottom-16 left-4 z-[120] flex h-[46vh] w-[min(560px,60vw)] flex-col overflow-hidden rounded-xl glass-hi shadow-2xl shadow-black/60 animate-fade-in">
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-bee-border/40 glass-toolbar px-2.5">
            <Columns3 className="size-3 text-bee-gold" />
            <span className="text-mini font-semibold text-bee-text">Task Comb</span>
            <button onClick={() => setOpen("none")} className="ml-auto rounded p-0.5 text-bee-textMuted hover:bg-bee-border/40 hover:text-bee-text">
              <X className="size-3" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PipelineBoard open tasks={tasks} statuses={statuses} onClose={() => setOpen("none")} />
          </div>
        </div>
      )}

      {/* QueenBee — bottom-right. ponytail: mounting the queen's CLI here
          respawns it (same pane id as the dock tab); acceptable while the dock
          is hidden in fullscreen. Portal the pane if that ever matters. */}
      {open === "queen" && (
        <div className="fixed bottom-16 right-4 z-[120] flex h-[56vh] w-[min(400px,44vw)] flex-col overflow-hidden rounded-xl glass-hi shadow-2xl shadow-black/60 animate-fade-in">
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-bee-border/40 glass-toolbar px-2.5">
            <QueenCrown className="size-3 text-bee-gold" />
            <span className="text-mini font-semibold text-bee-text">QueenBee</span>
            <div className="ml-auto flex items-center gap-1.5">
              <QueenModeSelect />
            </div>
            <button onClick={() => setOpen("none")} className="rounded p-0.5 text-bee-textMuted hover:bg-bee-border/40 hover:text-bee-text">
              <X className="size-3" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <QueenBeePanel />
          </div>
        </div>
      )}

      {/* Corner toggles (always visible in fullscreen) */}
      <button
        onClick={() => setOpen((o) => (o === "comb" ? "none" : "comb"))}
        className={`fixed bottom-4 left-4 z-[121] flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-mini font-medium shadow-lg transition-colors ${
          open === "comb"
            ? "border-bee-gold/50 bg-bee-gold/20 text-bee-goldHi"
            : "border-bee-border/60 glass-hi text-bee-textDim hover:text-bee-text"
        }`}
        title="Task Comb"
      >
        <Columns3 className="size-3.5" />
        Task Comb
      </button>
      <button
        onClick={() => setOpen((o) => (o === "queen" ? "none" : "queen"))}
        className={`fixed bottom-4 right-4 z-[121] flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-mini font-medium shadow-lg transition-colors ${
          open === "queen"
            ? "border-bee-gold/50 bg-bee-gold/20 text-bee-goldHi"
            : "border-bee-border/60 glass-hi text-bee-textDim hover:text-bee-text"
        }`}
        title="Ask QueenBee"
      >
        <QueenCrown className="size-3.5" />
        QueenBee
      </button>
    </>,
    document.body,
  );
}
