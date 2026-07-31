import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkerBee } from "@hiveory/worker-bees/ui";

/**
 * A "plane" is the single kind of surface the center shows at a time. Instead of
 * mixing agents, terminals, browsers and emulators in one grid, each plane holds
 * only its own kind — you switch planes from the title bar, and add items with
 * the plane's own `+`.
 */
export type PlaneKind = "honeyboard" | "browser" | "emulator";

/** The `WorkerBee.kind` a plane contains. `undefined` = a CLI agent. */
export type PaneKind = WorkerBee["kind"];

export interface PlaneDef {
  kind: PlaneKind;
  label: string;
  /** The pane kinds this plane owns. `agent` maps to undefined kind. The
   *  HoneyBoard board merges agents + terminals; browser/emulator stay separate. */
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
  { kind: "honeyboard", label: "HoneyBoard", paneKinds: ["agent", "shell", "openvsx", "browser", "toolbox", "emulator"], accent: "rgb(var(--bee-gold))", accentSoft: "rgb(var(--bee-gold) / 0.12)" },
  { kind: "browser",   label: "Browser",   paneKinds: ["browser"],        accent: "rgb(var(--bee-text-dim))", accentSoft: "rgb(var(--bee-text-dim) / 0.14)" },
  { kind: "emulator",  label: "Emulator",  paneKinds: ["emulator"],       accent: "rgb(var(--bee-ok))", accentSoft: "rgb(var(--bee-ok) / 0.14)" },
];

export function planeFor(kind: PlaneKind): PlaneDef {
  return PLANES.find((p) => p.kind === kind) ?? PLANES[0];
}

/**
 * Does a pane belong to this plane? A pane kind can now live in more than one
 * plane (a browser belongs in HoneyBoard *or* on its own), so a pane records the
 * plane it was added to and that wins. Without it, one browser would render in
 * two planes at once, and two BrowserPanes sharing a paneId means two CDP
 * targets fighting over one screencast.
 */
export function paneInPlane(bee: WorkerBee, plane: PlaneDef): boolean {
  if (bee.plane) return bee.plane === plane.kind;
  return plane.paneKinds.includes(bee.kind ?? "agent");
}

/**
 * How the HoneyBoard plane arranges its panes.
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
 * The board plane used to be called "honeyflow"; that name now belongs to the
 * canvas. A saved active: "honeyflow" would fall through planeFor()'s default
 * and silently look like the board while the stored value stayed wrong, so it
 * is rewritten once on load.
 */
export function migratePlaneState(persisted: unknown): { active: PlaneKind; view: BoardView } {
  const s = (persisted ?? {}) as { active?: string; view?: string };
  const active = s.active === "honeyflow" ? "honeyboard" : s.active;
  return {
    active: active && PLANES.some((p) => p.kind === active) ? (active as PlaneKind) : "honeyboard",
    view: s.view === "flow" ? "flow" : "board",
  };
}

export const usePlaneStore = create<PlaneState>()(
  persist(
    (set) => ({
      active: "honeyboard",
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
      name: "hiveory-plane",
      version: 2,
      // Fullscreen is a momentary state, not a preference worth restoring.
      partialize: (s) => ({ active: s.active, view: s.view }),
      migrate: migratePlaneState as never,
    },
  ),
);
