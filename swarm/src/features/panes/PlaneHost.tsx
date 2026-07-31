"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Globe, Smartphone,
  Plus, Maximize2, Minimize2,
  SquareTerminal, Blocks, Search, Boxes, ChevronDown,
} from "lucide-react";
import {
  BoardLogo, BoardStrip, themeForKind, type StripItem,
  LeadCrown, BrandGlyph, cliBrand, shellBrand, AgentMark,
} from "@swarm/board";
import { FlowCanvas, FlowMark, useCanvasStore } from "@swarm/flow";
import { OpenVsxLogo, OpenVsxPane } from "@swarm/extension";
import { invoke } from "@tauri-apps/api/core";
import { AgentPane } from "@swarm/agents/ui";
import { TerminalPane } from "@swarm/agents/ui";
import BrowserPane from "@/features/browser/BrowserPane";
import EmulatorPane from "@/features/emulator/EmulatorPane";
import { LeadPanel, LeadModeSelect } from "@swarm/lead/ui";
import { forgetSpawn } from "@swarm/agents/ui";
import { CLI_METADATA } from "@swarm/agents";
import { PipelineBoard, type TaskCard } from "@swarm/tasks";
import { X, Columns3 } from "lucide-react";
import SwarmLogo from "@/shared/SwarmLogo";
import { useAgentsStore, type Agent, type GridLayout } from "@swarm/agents/ui";
import { useWorkspaceStore } from "@swarm/workspace";
import { WorktreeSelect as WorktreeSelect, ToolboxPane } from "@swarm/workspace/ui";
import { useExtensionStore, isAgentExtension } from "@swarm/extension";
import { extensionAgentProps } from "@/host/extensionAgent";
import {
  usePlaneStore, planeFor, paneInPlane, type PlaneKind, type PlaneDef, type BoardView,
} from "./planeStore";
import { GRID_PRESETS, presetFor, PresetThumb } from "./gridPresets";

const INTERACTIVE = "button, input, select, textarea, a, [contenteditable], [role='button']";

const PLANE_ICON: Record<PlaneKind, React.ComponentType<{ className?: string }>> = {
  board: BoardLogo,
  browser: Globe,
  emulator: Smartphone,
};

/**
 * Every CLI and shell shows its own logo, so a pane is identifiable at a
 * glance without reading the title. Nothing here is a stand-in glyph: the
 * marks come from each vendor, via `@swarm/board`.
 */
function cliIconNode(cliId: string | undefined, px = 14) {
  const brand = cliBrand(cliId);
  return brand ? <BrandGlyph brand={brand} size={px} /> : <AgentMark size={px} />;
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
function paneIconNode(swarm: Agent, cls = "size-3") {
  const px = cls === "size-3" ? 12 : 14;
  if (swarm.kind === "shell") return shellIconNode(swarm.customName ?? swarm.cliName ?? swarm.cli, px);
  if (swarm.kind === "openvsx")
    return swarm.iconUrl ? <img src={swarm.iconUrl} alt="" className={`${cls} rounded-sm object-contain`} /> : <OpenVsxLogo className={cls} />;
  const meta = CLI_METADATA.find((c) => c.command === swarm.cli);
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
  const agents = useAgentsStore((s) => s.agents);
  const addAgent = useAgentsStore((s) => s.addAgent);
  const setAgentStatus = useAgentsStore((s) => s.setAgentStatus);
  const removeAgent = useAgentsStore((s) => s.removeAgent);
  const updateAgent = useAgentsStore((s) => s.updateAgent);
  const maximizedPane = useAgentsStore((s) => s.maximizedPane);
  const setMaximizedPane = useAgentsStore((s) => s.setMaximizedPane);
  const swapAgents = useAgentsStore((s) => s.swapAgents);
  const refitTerminals = useAgentsStore((s) => s.refitTerminals);
  const gridLayout = useAgentsStore((s) => s.gridLayout);
  const setGridLayout = useAgentsStore((s) => s.setGridLayout);
  const agentStatuses = useAgentsStore((s) => s.agentStatuses);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const active = usePlaneStore((s) => s.active);
  const view = usePlaneStore((s) => s.view);
  const setView = usePlaneStore((s) => s.setView);
  const fullscreen = usePlaneStore((s) => s.fullscreen);
  const toggleFullscreen = usePlaneStore((s) => s.toggleFullscreen);
  const plane = planeFor(active);
  // Only the board plane has two geometries; browser and emulator are grids.
  const canvasView = plane.kind === "board" && view === "flow" && !maximizedPane;

  const [editingSwarm, setEditingSwarm] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [shells, setShells] = useState<{ id: string; label: string; command: string }[]>([]);
  const [focusedPane, setFocusedPane] = useState<string | null>(null);

  // ── pointer-based pane drag (HTML5 DnD can't cross terminal/webview panes) ──
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; name: string } | null>(null);
  const [over, setOver] = useState<
    { kind: "snap"; id: GridLayout } | { kind: "pane"; id: string } | null
  >(null);
  // Live cursor position. A ref, not state: the ghost is moved by writing
  // transform straight to the DOM (see below), and only the very first frame
  // of the drag reads this during render.
  const pointerRef = useRef({ x: 0, y: 0 });
  const dragId = useRef<string | null>(null);
  // Teardown for whatever drag is in flight. Every exit route funnels through
  // it — mouseup, Escape, and the host unmounting mid-drag. Without that last
  // one a window-level mousemove outlives the component and keeps hit-testing
  // a detached tree on every mouse move, forever.
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

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

  const onPaneMouseDown = (e: React.MouseEvent, swarm: Agent) => {
    const t = e.target as HTMLElement;
    // Buttons/inputs handle themselves — never promote or drag from them, so a
    // pane's delete button works even in Focus mode.
    if (e.button !== 0 || t.closest(INTERACTIVE)) return;
    // A plain click must NOT change the spotlight — the spotlight only moves when
    // a pane is dragged and dropped onto another (positions swap). Otherwise
    // clicking anywhere in a pane would reshuffle the Focus grid.
    if (maximizedPane || !t.closest("[data-pane-drag]")) return;
    // The whole drag lives in this closure so `finish` can unregister exactly
    // the listeners this gesture added — component-level handlers are rebuilt
    // every render, and a re-render between mousedown and mouseup would leave
    // the old pair attached to window with nothing able to remove them.
    const start = { id: swarm.id, name: swarm.customName || swarm.cliName, x: e.clientX, y: e.clientY };
    pointerRef.current = { x: e.clientX, y: e.clientY };

    const move = (ev: MouseEvent) => {
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
      // The ghost follows the cursor via a direct style write. Routing 60
      // samples a second through setState would re-render every live terminal
      // on the board for the length of the drag.
      const g = ghostRef.current;
      if (g) g.style.transform = `translate3d(${ev.clientX + 14}px, ${ev.clientY + 14}px, 0)`;
      if (!dragId.current) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
        dragId.current = start.id;
        setDrag({ id: start.id, name: start.name });
      }
      const hit = hitTest(ev.clientX, ev.clientY);
      // Same target as the previous sample ⇒ hand React the identical object so
      // it bails out, instead of reconciling the whole grid on every move.
      setOver((cur) => (cur?.kind === hit?.kind && cur?.id === hit?.id ? cur : hit));
    };
    const finish = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", key);
      endDrag.current = null;
      dragId.current = null;
      setDrag(null);
      setOver(null);
    };
    const up = (ev: MouseEvent) => {
      const dropped = dragId.current;
      // Hit-test before tearing down — hitTest skips the pane being dragged,
      // which it can only know while dragId is still set. Then tear down
      // unconditionally: a drop that lands on nothing must still restore the
      // board rather than leave a ghost and a highlighted target behind.
      const o = dropped ? hitTest(ev.clientX, ev.clientY) : null;
      finish();
      if (o?.kind === "snap") setGridLayout(o.id);
      else if (o?.kind === "pane") {
        // Drop onto another pane = SWAP their positions (works in every grid,
        // Focus included: swapping into slot 0 makes that pane the spotlight).
        // Read the live list: a pane can open or close mid-drag, and indices
        // from a stale array would swap two unrelated panes.
        const list = useAgentsStore.getState().agents;
        const from = list.findIndex((b) => b.id === dropped);
        const to = list.findIndex((b) => b.id === o.id);
        if (from >= 0 && to >= 0) swapAgents(from, to);
      }
    };
    // Escape aborts: the pane goes back where it was and no layout is applied.
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") finish(); };

    endDrag.current = finish;
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", key);
  };

  /* ── agent sync ─────────────────────────────────────────────
     None needed: every agent's panes live in the pane store at once and
     are filtered by workspaceId below. Swapping the array on switch used to
     unmount the other folder's agents and respawn them on return. */
  useEffect(() => {
    const id = requestAnimationFrame(() => refitTerminals());
    return () => cancelAnimationFrame(id);
  }, [gridLayout, active, fullscreen]);

  useEffect(() => {
    invoke("detect_shells").then((s: any) => setShells(Array.isArray(s) ? s : [])).catch(() => {});
  }, []);

  // Escape closes the add menu. Its click-outside backdrop is no help to
  // someone who opened it by accident and never moves the pointer.
  useEffect(() => {
    if (!showAdd) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAdd(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAdd]);

  // Shut down the shared CDP browser when no browser panes remain.
  const browserCount = agents.filter((b) => b.kind === "browser").length;
  useEffect(() => {
    if (browserCount === 0) invoke("stop_cdp_browser").catch(() => {});
  }, [browserCount]);

  /* ── plane items ────────────────────────────────────────────── */
  // This folder's panes only; the Lead leaves the grid for the dock tab.
  // Other workspaces' panes stay mounted-but-unrendered — their agents keep
  // running while you work in another folder.
  const items = agents.filter(
    (b) => b.workspaceId === activeWorkspaceId && !b.isLead && paneInPlane(b, plane),
  );

  /* ── adds (into the active plane) ─────────────────────────────
     addAgentPane stamps the active agent on the pane and the store
     persists itself, so nothing extra to save here. */
  const addAgentPane = (cli: string, name: string) => {
    const swarm: Agent = { id: `swarm-${Date.now()}`, cli, cliName: name };
    addAgent(swarm); setAgentStatus(swarm.id, "launching");
  };
  const addShell = (shell?: { label: string; command: string }) => {
    const swarm: Agent = {
      id: `terminal-${Date.now()}`, cli: shell?.command ?? "shell",
      cliName: shell?.label ?? "Terminal", kind: "shell",
    };
    addAgent(swarm);
  };
  // `plane` records where the pane was added from, because a browser is legal
  // in both Board and the Browser plane (see paneInPlane).
  const addBrowser = (plane: PlaneKind = "browser") => {
    const swarm: Agent = {
      id: `browser-${Date.now()}`, cli: "browser", cliName: "Browser", kind: "browser", plane,
    };
    addAgent(swarm);
  };
  const addToolbox = () => {
    const swarm: Agent = {
      id: `toolbox-${Date.now()}`, cli: "toolbox", cliName: "Toolbox", kind: "toolbox", plane: "board",
    };
    addAgent(swarm);
  };
  const addEmulator = () => {
    const swarm: Agent = {
      id: `emulator-${Date.now()}`, cli: "emulator", cliName: "Emulator",
      kind: "emulator", plane: "board",
    };
    addAgent(swarm);
  };
  const addOpenVsx = (ext?: { id: string; name: string; icon?: string }) => {
    const swarm: Agent = {
      id: `openvsx-${Date.now()}`, cli: "openvsx", cliName: ext?.name || "SwarmExtension", kind: "openvsx",
      extensionId: ext?.id, iconUrl: ext?.icon,
      // Claude Code, Kilo Code and OpenChamber are agents: they join the swarm
      // like Agents and may be crowned. Tool extensions are just panes.
      agentExt: isAgentExtension(ext?.id),
    };
    addAgent(swarm);
  };

  // Panes whose `kind` marks them as something other than a live CLI-agent
  // session — these don't run a stateful agent, so closing them needs no
  // confirmation. Anything else (kind undefined, rendered via AgentPane)
  // is a running swarm and can lose real work if killed by accident.
  const NON_AGENT_KINDS = new Set(["shell", "browser", "toolbox", "emulator", "openvsx"]);
  const handleRemove = (id: string) => {
    const swarm = agents.find((b) => b.id === id);
    const isAgentPane = !!swarm && !NON_AGENT_KINDS.has(swarm.kind ?? "");
    if (isAgentPane && !window.confirm("Close this agent? Its running session will be killed.")) return;
    // A real close kills the pty, so drop the reattach record with it — and
    // the pane's canvas geometry, which nothing else will ever collect.
    forgetSpawn(id);
    useCanvasStore.getState().removeNode(id);
    invoke("kill_terminal", { paneId: id }).finally(() => removeAgent(id));
  };
  const toggleMaximize = (id: string) => {
    setMaximizedPane(maximizedPane === id ? null : id);
    requestAnimationFrame(() => refitTerminals());
  };
  const startRename = (id: string) => {
    const swarm = agents.find((b) => b.id === id);
    if (swarm) { setEditingSwarm(id); setEditValue(swarm.customName || swarm.cliName); }
  };
  const saveRename = () => {
    if (editingSwarm) { updateAgent(editingSwarm, { customName: editValue }); setEditingSwarm(null); setEditValue(""); }
  };
  const cancelRename = () => { setEditingSwarm(null); setEditValue(""); };

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
  // Row floor. Under this a pane is mostly header: a terminal shows single
  // digit lines and the chrome reads as broken. Better to scroll than to
  // render something unusable.
  const MIN_ROW = 180;
  const count = items.length;

  // The plane header's height, in one place. The board plane's header is the
  // BoardStrip (`h-11`); every other plane uses the `h-9` toolbar rendered
  // below. Anything that must sit flush under the header measures from here
  // rather than carrying its own copy of the number.
  const headerH = active === "board" ? 44 : 36;

  /**
   * One pane, whichever view is showing. The grid wraps this in a slot and the
   * canvas wraps it in a node; the pane itself must not know the difference, or
   * switching views would tear down every terminal and browser in the agent.
   */
  const renderPane = (swarm: Agent, isThisMax: boolean) => {
    // Route this agent/terminal to its chosen worktree dir (undefined
    // worktreeId = the agent's main path). Changing it respawns.
    const swarmTree = activeWorkspace?.worktrees?.find((t) => t.id === swarm.worktreeId);
    const swarmDir = swarmTree?.path ?? workingDir;
    const treeSelect = (
      <WorktreeSelect
        trees={activeWorkspace?.worktrees ?? []}
        value={swarm.worktreeId}
        onChange={(id) => updateAgent(swarm.id, { worktreeId: id })}
      />
    );
    const close = () => handleRemove(swarm.id);
    const max = () => toggleMaximize(swarm.id);

    if (swarm.kind === "emulator")
      return <EmulatorPane onClose={close} onToggleMaximize={max} isMaximized={isThisMax} />;
    if (swarm.kind === "openvsx")
      return (
        <OpenVsxPane
          paneId={swarm.id} workingDir={workingDir}
          tabName={swarm.customName || swarm.cliName} extensionId={swarm.extensionId}
          onClose={close} onToggleMaximize={max} isMaximized={isThisMax}
          {...extensionAgentProps(swarm, agents)}
        />
      );
    if (swarm.kind === "browser")
      return <BrowserPane paneId={swarm.id} initialUrl={swarm.url} onClose={close} onToggleMaximize={max} isMaximized={isThisMax} />;
    if (swarm.kind === "toolbox")
      return <ToolboxPane paneId={swarm.id} onClose={close} onToggleMaximize={max} isMaximized={isThisMax} />;
    if (swarm.kind === "shell")
      return (
        <TerminalPane
          paneId={swarm.id} workingDir={swarmDir}
          tabName={swarm.customName || swarm.cliName}
          shellCommand={swarm.cli !== "shell" ? swarm.cli : undefined}
          shellLabel={swarm.cliName}
          onRename={editingSwarm === swarm.id ? saveRename : () => startRename(swarm.id)}
          isEditing={editingSwarm === swarm.id} editValue={editValue}
          onEditChange={setEditValue} onCancelRename={cancelRename}
          onClose={close} onToggleMaximize={max} isMaximized={isThisMax}
          headerExtra={treeSelect}
        />
      );
    return (
      <AgentPane
        paneId={swarm.id} workingDir={swarmDir} agent={swarm}
        onRename={editingSwarm === swarm.id ? saveRename : () => startRename(swarm.id)}
        isEditing={editingSwarm === swarm.id} editValue={editValue}
        onEditChange={setEditValue} onCancelRename={cancelRename}
        onClose={close} onToggleMaximize={max} isMaximized={isThisMax}
        headerExtra={treeSelect}
        sharedMemoryDir={activeWorkspace?.boundProjectPath || workingDir}
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
      // Master is one tall pane beside a stack of the rest — always two
      // columns. It used to fall through to the default branch and report a
      // column count its own template never used, which made the overflow
      // count below lie about how many panes were off-screen.
      case "master": return 2;
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

  // How many rows the content actually needs, then how many of them share one
  // screen. Focus: 2 rows up top (spotlight height); panes 4+ overflow into a
  // 4-wide grid below, scrolling.
  const totalRows = focusMode
    ? 2 + Math.ceil(Math.max(0, count - 3) / 4)
    : isMaster
    ? Math.max(1, count - 1)
    : Math.max(1, Math.ceil(count / cols));
  // Never reserve more rows than the layout fills. A 2×2 preset holding two
  // panes used to keep the second row's height back and leave a dead band
  // under them; the same happened to every grid preset as panes were closed.
  // Legacy (non-preset) layouts fit all their rows on one screen — they had
  // fixed 240px rows that ignored the plane's height entirely.
  const rowsPerPage = Math.min(
    focusMode ? 2 : preset ? preset.rows ?? 1 : gridLayout === "rows" ? 1 : totalRows,
    totalRows,
  );
  const overflow = totalRows > rowsPerPage;
  const subtract = (overflow ? PEEK : 0) + GAP * (rowsPerPage - 1);
  const rowVal = `max(${MIN_ROW}px, calc((100cqh - ${subtract}px) / ${rowsPerPage}))`;
  // How many panes sit below the visible rows — the PEEK sliver alone is easy
  // to miss with several panes open, so surface the count next to it too.
  const hiddenCount = !overflow ? 0 : focusMode ? count - 3 : Math.max(0, count - cols * rowsPerPage);

  // Explicit placement, for the two layouts whose slots aren't interchangeable.
  //
  // Focus: the spotlight is simply the pane in slot 0 — dragging a pane onto it
  // swaps positions and promotes it, so there is no second selection to track.
  // It fills cols 1..split-1; the next two panes fill the remaining top columns
  // as full rows; panes 4+ flow into a 4-wide block below (3 of 12 tracks each).
  const spotlightId = focusMode ? items[0]?.id : null;
  const place = new Map<string, React.CSSProperties>();
  if (focusMode) {
    const split = focus4 ? 7 : 9; // spotlight occupies cols 1..split-1
    let c = 0; // index among non-spotlight panes
    for (const b of items) {
      if (b.id === spotlightId) {
        place.set(b.id, { gridColumn: `1 / ${split}`, gridRow: "1 / 3" });
      } else if (c === 0) {
        // With only one pane beside the spotlight, give it the whole side
        // column — otherwise half the grid sits visibly empty.
        place.set(b.id, { gridColumn: `${split} / 13`, gridRow: count === 2 ? "1 / 3" : "1" });
        c++;
      } else if (c === 1) {
        place.set(b.id, { gridColumn: `${split} / 13`, gridRow: "2" });
        c++;
      } else {
        const k = c - 2;
        place.set(b.id, { gridColumn: `${1 + (k % 4) * 3} / span 3`, gridRow: `${3 + Math.floor(k / 4)}` });
        c++;
      }
    }
  } else if (isMaster && items[0]) {
    // Master: the first pane owns the full-height left column. Without the
    // span it just took cell (1,1) and the "master" layout rendered as a
    // two-column grid with empty cells trailing off the bottom.
    place.set(items[0].id, { gridColumn: "1", gridRow: "1 / -1" });
  }

  /* A maximized pane fills the plane body — it is a one-cell grid, not an
     overlay. As a `fixed` overlay it had to carry the header height and the
     status bar height as magic numbers (wrong by a pixel in one plane, wrong
     by the whole status bar in fullscreen) and it spilled under the sidebars,
     which live outside this column entirely. Covering the window is what the
     plane's own fullscreen toggle is for. */
  const gridStyle: React.CSSProperties = maximizedPane
    ? { gridTemplateColumns: "1fr", gridTemplateRows: "1fr", height: "100%" }
    : isMaster
    ? { gridTemplateColumns: "1.7fr 1fr", gridTemplateRows: `repeat(${totalRows}, minmax(0, 1fr))`, height: "100%" }
    : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: rowVal };

  const Icon = PLANE_ICON[active];
  const dragged = drag ? items.find((b) => b.id === drag.id) : undefined;

  // Chips for the Board strip — one per open component.
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
      {active === "board" ? (
        <div className="relative z-30 shrink-0">
          <BoardStrip
            items={stripItems}
            activeId={focusedPane}
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
            logoNode={<SwarmLogo size={20} className="shrink-0" />}
            viewToggle={<ViewToggle view={view} onChange={setView} />}
            leading={leading}
            reserveRight={fullscreen ? 0 : reserveRight}
          />
          {showAdd && (
            <div className="absolute left-2 top-full z-50">
              <PlaneAddMenu
                plane={plane}
                shells={shells}
                onAgent={(id, name) => { addAgentPane(id, name); setShowAdd(false); }}
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
        <div className="relative z-30 flex h-9 shrink-0 items-center gap-2 border-b border-swarm-border/50 glass-toolbar px-2.5">
          {fullscreen && <SwarmLogo size={20} className="shrink-0" />}
          <Icon className="size-3.5 shrink-0 text-swarm-gold" />
          <span className="text-xs font-semibold text-swarm-text">{plane.label}</span>
          <span className="text-micro text-swarm-textMuted">{count > 0 ? `${count} open` : ""}</span>

          <div className="relative ml-1">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-0.5 rounded-md border border-swarm-gold/25 bg-swarm-gold/10 px-1.5 py-0.5 text-micro font-medium text-swarm-goldHi transition-colors hover:bg-swarm-gold/20"
              title={`Add to ${plane.label}`}
            >
              <Plus className="size-3" />
            </button>
            {showAdd && (
              <PlaneAddMenu
                plane={plane}
                shells={shells}
                onAgent={(id, name) => { addAgentPane(id, name); setShowAdd(false); }}
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
              className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-black/20 hover:text-swarm-text"
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
        <div className="pointer-events-none absolute inset-x-0 z-[60] flex justify-center px-4 pt-3" style={{ top: headerH }}>
          <div className="flex items-end gap-2 rounded-2xl border border-swarm-border/60 glass-hi px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md animate-fade-in">
            {/* Only offer presets the current pane count can actually fill:
                a column preset needs its full column count, a grid preset needs
                at least one pane on its second row (a 2×2 holding two panes is
                just "2 columns"), and Focus needs a spotlight plus one other. */}
            {GRID_PRESETS.filter((p) => count >= (p.focus ? 2 : p.rows ? p.cols + 1 : p.cols)).map((p) => {
              const hot = over?.kind === "snap" && over.id === p.id;
              return (
                <div
                  key={p.id}
                  data-snap={p.id}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors ${
                    hot ? "bg-swarm-gold/20 scale-105" : ""
                  }`}
                >
                  <PresetThumb cols={p.cols} rows={p.rows ?? 1} focus={p.focus} focusWide={p.id === "focus4"} active={hot || gridLayout === p.id} size={46} />
                  <span className={`text-micro font-medium ${hot ? "text-swarm-goldHi" : "text-swarm-textMuted"}`}>{p.label}</span>
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
          <FlowCanvas
            swarmId={activeWorkspaceId || "default"}
            items={items.map((swarm) => ({ id: swarm.id, content: renderPane(swarm, maximizedPane === swarm.id) }))}
            onZoomSettled={refitTerminals}
            emptyState={<PlaneEmpty plane={plane} onAdd={() => setShowAdd(true)} />}
          />
        ) : count === 0 ? (
          <PlaneEmpty plane={plane} onAdd={() => setShowAdd(true)} />
        ) : (
          <div className="grid gap-2" style={gridStyle}>
            {items.map((swarm) => {
              const isThisMax = maximizedPane === swarm.id;
              const shouldHide = maximizedPane !== null && !isThisMax;
              return (
                <div
                  key={swarm.id}
                  data-pane-id={swarm.id}
                  onMouseDown={(e) => onPaneMouseDown(e, swarm)}
                  // Focus marks the active pane and it stays marked. Clearing on
                  // blur meant the accent vanished the moment you touched the
                  // strip or the dock, so nothing on screen said which pane your
                  // next keystroke belongs to.
                  onFocusCapture={() => setFocusedPane(swarm.id)}
                  /* Only non-layout properties transition. `transition-all` also
                     animated width/height, so every preset switch dragged each
                     terminal through 300ms of intermediate sizes — a reflow storm
                     for the pane ResizeObservers and visible reflowing text.
                     The border is 2px on all four sides from the start (three of
                     them transparent): `.pane-active` widens every side to 2px,
                     so a pane that only had a top border shoved its own contents
                     2px left and up the instant you focused it. */
                  className={`flex flex-col overflow-hidden glass glass-lift animate-scale-in ${
                    shouldHide
                      ? "hidden"
                      : "relative h-full rounded-lg border-2 border-transparent transition-[box-shadow,border-color,opacity] duration-200"
                  } ${drag?.id === swarm.id ? "opacity-30" : ""} ${
                    over?.kind === "pane" && over.id === swarm.id ? "ring-2 ring-swarm-gold/70" : ""
                  } ${focusedPane === swarm.id && !isThisMax ? "pane-active" : ""}`}
                  style={
                    shouldHide
                      ? undefined
                      : {
                          // Same top edge for every class — class identity is the
                          // strip/header dot only. Accent only while a drop targets it.
                          borderTopColor: over?.kind === "pane" && over.id === swarm.id
                            ? themeForKind(swarm.kind).accent
                            : "rgb(var(--swarm-border))",
                          ...place.get(swarm.id),
                        }
                  }
                >
                  {renderPane(swarm, isThisMax)}
                </div>
              );
            })}
          </div>
        )}

        {/* Overflow hint — the PEEK sliver alone (~34px of the next row's
            titlebar) is easy to miss with several panes open, so also call
            out how many are below. */}
        {!canvasView && !maximizedPane && overflow && hiddenCount > 0 && (
          <div className="pointer-events-none sticky inset-x-0 bottom-1 z-20 flex justify-center">
            <span className="pointer-events-none flex items-center gap-1 rounded-full border border-swarm-gold/40 glass-hi px-2 py-0.5 text-micro font-medium text-swarm-goldHi shadow-lg">
              <ChevronDown className="size-3" />
              {hiddenCount} more below
            </span>
          </div>
        )}
      </div>

      {/* Drag ghost — a small label chip following the cursor while dragging.
          Anchored at the origin and moved by transform: `move` writes that
          transform directly (see onPaneMouseDown), so only this first frame is
          positioned from React. It wears the dragged pane's own icon, not the
          plane's, so you can tell which terminal is in your hand. */}
      {drag && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed left-0 top-0 z-[70] flex items-center gap-1.5 rounded-lg border border-swarm-gold/50 glass-hi px-2.5 py-1 text-mini font-medium text-swarm-goldHi shadow-xl shadow-black/50"
          style={{ transform: `translate3d(${pointerRef.current.x + 14}px, ${pointerRef.current.y + 14}px, 0)` }}
        >
          {dragged ? paneIconNode(dragged, "size-3.5") : <Icon className="size-3.5" />}
          {drag.name}
        </div>
      )}

      {/* Fullscreen hides the docked Tasks + Lead dock, so offer both as
          floating widgets: Lead bottom-right, Tasks bottom-left. */}
      {fullscreen && (
        <FullscreenWidgets
          tasks={activeWorkspace?.taskCards ?? []}
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
  if (plane.kind === "board") {
    const agents = CLI_METADATA.filter((c) => has(c.name) || has(c.command)).slice(0, 4);
    const terms = shells.filter((s) => has(s.label)).slice(0, 4);
    const exts = extensions.filter((e) => has(e.name) || has(e.publisher)).slice(0, 4);
    // Panes that are not an agent, a terminal or an extension, but still belong
    // on the board: a preview next to the agent building it, and the toolbox
    // that arms every swarm in the swarm.
    const tools = [
      { key: "browser", title: "Browser", subtitle: "localhost preview", icon: Globe, onClick: onBrowser },
      { key: "emulator", title: "Android Emulator", subtitle: "run an AVD", icon: Smartphone, onClick: onEmulator },
      { key: "toolbox", title: "Toolbox", subtitle: "skills + MCP for every swarm", icon: Boxes, onClick: onToolbox },
    ].filter((t) => has(t.title) || has(t.subtitle));
    return (
      <>
        <div className="fixed inset-0 z-40" onClick={onClose} />
        <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl glass-hi p-1.5 animate-fade-in">
          <div className="mb-1 flex h-7 items-center gap-1.5 rounded-md border border-swarm-border/60 glass-inset px-2 focus-within:border-swarm-gold/50">
            <Search className="size-3 text-swarm-textMuted" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search components…"
              className="min-w-0 flex-1 bg-transparent text-mini text-swarm-text outline-none placeholder:text-swarm-textMuted/60"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-sleek">
            {terms.length > 0 && <MenuLabel>Terminals</MenuLabel>}
            {terms.map((s) => (
              <MenuItem key={s.id} onClick={() => onShell(s)} iconNode={shellIconNode(s.label)} title={s.label} />
            ))}
            {agents.length > 0 && <MenuLabel>Agents</MenuLabel>}
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
              <div className="px-2.5 py-3 text-center text-mini text-swarm-textMuted">No matches.</div>
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
    { id: "board", label: "Board", hint: "Every pane in equal slots", Icon: BoardLogo },
    { id: "flow", label: "Flow", hint: "Place panes freely on an infinite canvas", Icon: FlowMark },
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
                ? "bg-swarm-gold/18 text-swarm-goldHi shadow-[inset_0_1px_0_0_rgb(var(--swarm-text)/0.10)]"
                : "text-swarm-textMuted hover:bg-swarm-border/40 hover:text-swarm-text"
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
  return <div className="px-2 pb-0.5 pt-1.5 text-micro font-semibold uppercase tracking-wider text-swarm-gold">{children}</div>;
}
function MenuItem({ onClick, title, subtitle, icon: Icon = Plus, iconNode }: { onClick: () => void; title: string; subtitle?: string; icon?: React.ComponentType<{ className?: string }>; iconNode?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-swarm-textDim transition-colors hover:bg-swarm-border/50 hover:text-swarm-text">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-swarm-gold">
        {iconNode ?? <Icon className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {subtitle && <span className="block truncate text-micro text-swarm-textMuted">{subtitle}</span>}
      </span>
    </button>
  );
}

/* ── empty + placeholder states ───────────────────────────────── */
function PlaneEmpty({ plane, onAdd }: { plane: PlaneDef; onAdd: () => void }) {
  const Icon = PLANE_ICON[plane.kind];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center animate-fade-in">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-swarm-gold/10">
        <Icon className="size-6 text-swarm-gold" />
      </div>
      <div className="text-sm font-medium text-swarm-textDim">No {plane.label.toLowerCase()} open</div>
      <button
        onClick={onAdd}
        className="rounded-lg border border-swarm-gold/25 bg-swarm-gold/10 px-3 py-1 text-mini font-medium text-swarm-goldHi transition-colors hover:bg-swarm-gold/20"
      >
        Add {plane.label}
      </button>
    </div>
  );
}

/* ── floating widgets shown when a plane is fullscreen ────────── */
function FullscreenWidgets({ tasks, statuses }: { tasks: TaskCard[]; statuses: Record<string, string> }) {
  const [open, setOpen] = useState<"none" | "lead" | "comb">("none");
  // Portalled to <body>. A fullscreen plane is itself `fixed z-[100]` inside an
  // `overflow-hidden` column, so anything rendered in place inherits that
  // stacking context and clip — these floaters must escape both.
  return createPortal(
    <>
      {/* Tasks — bottom-left */}
      {open === "comb" && (
        <div className="fixed bottom-16 left-4 z-[120] flex h-[46vh] w-[min(560px,60vw)] flex-col overflow-hidden rounded-xl glass-hi shadow-2xl shadow-black/60 animate-fade-in">
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-swarm-border/40 glass-toolbar px-2.5">
            <Columns3 className="size-3 text-swarm-gold" />
            <span className="text-mini font-semibold text-swarm-text">Tasks</span>
            <button onClick={() => setOpen("none")} className="ml-auto rounded p-0.5 text-swarm-textMuted hover:bg-swarm-border/40 hover:text-swarm-text">
              <X className="size-3" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <PipelineBoard open tasks={tasks} statuses={statuses} onClose={() => setOpen("none")} />
          </div>
        </div>
      )}

      {/* Lead — bottom-right. ponytail: mounting the lead's CLI here
          respawns it (same pane id as the dock tab); acceptable while the dock
          is hidden in fullscreen. Portal the pane if that ever matters. */}
      {open === "lead" && (
        <div className="fixed bottom-16 right-4 z-[120] flex h-[56vh] w-[min(400px,44vw)] flex-col overflow-hidden rounded-xl glass-hi shadow-2xl shadow-black/60 animate-fade-in">
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-swarm-border/40 glass-toolbar px-2.5">
            <LeadCrown className="size-3 text-swarm-gold" />
            <span className="text-mini font-semibold text-swarm-text">Lead</span>
            <div className="ml-auto flex items-center gap-1.5">
              <LeadModeSelect />
            </div>
            <button onClick={() => setOpen("none")} className="rounded p-0.5 text-swarm-textMuted hover:bg-swarm-border/40 hover:text-swarm-text">
              <X className="size-3" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <LeadPanel />
          </div>
        </div>
      )}

      {/* Corner toggles (always visible in fullscreen) */}
      <button
        onClick={() => setOpen((o) => (o === "comb" ? "none" : "comb"))}
        className={`fixed bottom-4 left-4 z-[121] flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-mini font-medium shadow-lg transition-colors ${
          open === "comb"
            ? "border-swarm-gold/50 bg-swarm-gold/20 text-swarm-goldHi"
            : "border-swarm-border/60 glass-hi text-swarm-textDim hover:text-swarm-text"
        }`}
        title="Tasks"
      >
        <Columns3 className="size-3.5" />
        Tasks
      </button>
      <button
        onClick={() => setOpen((o) => (o === "lead" ? "none" : "lead"))}
        className={`fixed bottom-4 right-4 z-[121] flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-mini font-medium shadow-lg transition-colors ${
          open === "lead"
            ? "border-swarm-gold/50 bg-swarm-gold/20 text-swarm-goldHi"
            : "border-swarm-border/60 glass-hi text-swarm-textDim hover:text-swarm-text"
        }`}
        title="Ask Lead"
      >
        <LeadCrown className="size-3.5" />
        Lead
      </button>
    </>,
    document.body,
  );
}
