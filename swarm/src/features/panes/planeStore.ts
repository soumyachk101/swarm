import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Agent } from "@swarm/agents/ui";

/**
 * A "plane" is the single kind of surface the center shows at a time. Instead of
 * mixing agents, terminals, browsers and emulators in one grid, each plane holds
 * only its own kind — you switch planes from the title bar, and add items with
 * the plane's own `+`.
 */
export type PlaneKind = "board" | "browser" | "emulator";

/** The `Agent.kind` a plane contains. `undefined` = a CLI agent. */
export type PaneKind = Agent["kind"];

export interface PlaneDef {
  kind: PlaneKind;
  label: string;
  /** The pane kinds this plane owns. `agent` maps to undefined kind. The
   *  Board board merges agents + terminals; browser/emulator stay separate. */
  paneKinds: (NonNullable<PaneKind> | "agent")[];
  /** Distinct accent per section. */
  accent: string;
  /** Softer fill used behind the plane header. */
  accentSoft: string;
}

export const PLANES: PlaneDef[] = [
  // The board holds everything. The plane tabs are gone from the title bar —
  // a browser, an emulator and the toolbox all open from the strip's own `+`
  // and sit beside the agent that needs them, which is how they get used.
  { kind: "board", label: "Board", paneKinds: ["agent", "shell", "openvsx", "browser", "toolbox", "emulator"], accent: "rgb(var(--swarm-gold))", accentSoft: "rgb(var(--swarm-gold) / 0.12)" },
  { kind: "browser",   label: "Browser",   paneKinds: ["browser"],        accent: "rgb(var(--swarm-text-dim))", accentSoft: "rgb(var(--swarm-text-dim) / 0.14)" },
  { kind: "emulator",  label: "Emulator",  paneKinds: ["emulator"],       accent: "rgb(var(--swarm-ok))", accentSoft: "rgb(var(--swarm-ok) / 0.14)" },
];

export function planeFor(kind: PlaneKind): PlaneDef {
  return PLANES.find((p) => p.kind === kind) ?? PLANES[0];
}

/**
 * Does a pane belong to this plane? A pane kind can now live in more than one
 * plane (a browser belongs in Board *or* on its own), so a pane records the
 * plane it was added to and that wins. Without it, one browser would render in
 * two planes at once, and two BrowserPanes sharing a paneId means two CDP
 * targets fighting over one screencast.
 */
export function paneInPlane(swarm: Agent, plane: PlaneDef): boolean {
  if (swarm.plane) return swarm.plane === plane.kind;
  return plane.paneKinds.includes(swarm.kind ?? "agent");
}

/**
 * How the Board plane arranges its panes.
 *  board - equal slots in a grid. Best when you want everything at once.
 *  flow  - an infinite canvas you place panes on. Best when the layout itself
 *          carries meaning (a reviewer beside what it reviews).
 * Same panes either way; only the geometry differs.
 */
export type BoardView = "board" | "flow";

interface PlaneState {
  active: PlaneKind;
  view: BoardView;
  setView: (v: BoardView) => void;
  toggleView: () => void;
  /** Plane fills the whole window, over the title/status bars, until restored. */
  fullscreen: boolean;
  setActive: (k: PlaneKind) => void;
  setFullscreen: (v: boolean) => void;
  toggleFullscreen: () => void;
}

/**
 * Two renames, folded into one migration:
 *  - the board plane used to be called "honeyflow"; that name now belongs to
 *    the canvas.
 *  - it was then called "honeyboard", before the Hiveory -> Swarm rename
 *    dropped the "honey" prefix in favour of the plain "board".
 * A saved active from either era would fall through planeFor()'s default and
 * silently look like the board while the stored value stayed wrong, so both
 * are rewritten to "board" once on load.
 */
export function migratePlaneState(persisted: unknown): { active: PlaneKind; view: BoardView } {
  const s = (persisted ?? {}) as { active?: string; view?: string };
  const active = s.active === "honeyflow" || s.active === "honeyboard" ? "board" : s.active;
  return {
    active: active && PLANES.some((p) => p.kind === active) ? (active as PlaneKind) : "board",
    view: s.view === "flow" ? "flow" : "board",
  };
}

export const usePlaneStore = create<PlaneState>()(
  persist(
    (set) => ({
      active: "board",
      // The grid is the default: it needs no navigation, so a first run shows
      // every pane without the user having to find anything.
      view: "board",
      fullscreen: false,
      setActive: (active) => set({ active }),
      setView: (view) => set({ view }),
      toggleView: () => set((s) => ({ view: s.view === "board" ? "flow" : "board" })),
      setFullscreen: (fullscreen) => set({ fullscreen }),
      toggleFullscreen: () => set((s) => ({ fullscreen: !s.fullscreen })),
    }),
    {
      name: "swarm-plane",
      version: 3,
      // Fullscreen is a momentary state, not a preference worth restoring.
      partialize: (s) => ({ active: s.active, view: s.view }),
      migrate: migratePlaneState as never,
    },
  ),
);
