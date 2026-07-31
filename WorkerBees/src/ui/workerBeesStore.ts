import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appStorage } from "./persistStorage.js";
import type { QueenBeeMode } from "@hiveory/queenbee";
import { workerBeesHost } from "./host.js";

export interface WorkerBee {
  id: string;
  cli: string;
  cliName: string;
  customName?: string;
  args?: string[];
  // 'agent' (a CLI coding agent, the default), 'shell' (a plain terminal),
  // 'browser' (a CDP-driven Chromium view), 'emulator' (Android/AVD), or
  // 'openvsx' (an embedded openvscode-server). Each renders its own pane.
  kind?: 'agent' | 'shell' | 'browser' | 'emulator' | 'openvsx' | 'toolbox';
  /** Which plane this pane was added to. Some kinds (browser, toolbox) are
   *  allowed in more than one plane, so the choice has to be recorded or the
   *  pane would render in every plane that accepts its kind. */
  plane?: 'honeyboard' | 'browser' | 'emulator';
  /** browser panes only — page to open on mount */
  url?: string;
  /** openvsx panes — the Open-VSX extension id to install + open, and its icon */
  extensionId?: string;
  iconUrl?: string;
  /** An 'openvsx' pane running an AI coding agent (Claude Code, Kilo Code,
   *  OpenChamber). These join the hive like WorkerBees and can wear the crown;
   *  plain tool extensions cannot. */
  agentExt?: boolean;
  /** Which workhive worktree ("tree") this agent operates in. Undefined = the
   *  workhive's main bound repo path. Changing it respawns the agent there. */
  worktreeId?: string;
  /** Which workhive (and therefore which folder) this pane belongs to. Every
   *  workhive's panes live in this one store; the grid renders only the active
   *  workhive's, so switching folders never tears another folder's agents down. */
  workHiveId?: string;
  /** At most one bee per workhive carries the crown. The QueenBee is an
   *  ordinary CLI agent promoted to lead: it leaves the grid and runs in the
   *  QueenBee dock tab for its own folder. */
  isQueen?: boolean;
  /** Which QueenBee role prompt was last sent into this CLI. */
  queenMode?: QueenBeeMode;
  /** Model and effort this bee was summoned with, when the caller pinned them.
   *  Kept for display and so a respawn reuses the same configuration. */
  model?: string;
  effort?: string;
}

export type AgentStatus = 'launching' | 'running' | 'idle' | 'error' | 'done';

// Pane layout presets. The five picker presets (cols2…grid4x2) pin a column
// count (grid* also pin rows); legacy values are kept for the QueenBee tool and
// any persisted workHives.
export type GridLayout =
  | "cols2" | "cols3" | "cols4" | "grid2x2" | "grid3x2" | "grid4x2" | "focus" | "focus4"
  | "auto" | "grid" | "cols" | "rows" | "master" | 1 | 2 | 3 | 4;

interface WorkerBeesState {
  workerBees: WorkerBee[];
  addWorkerBee: (workerBee: WorkerBee) => void;
  removeWorkerBee: (beeId: string) => void;
  updateWorkerBee: (beeId: string, updates: Partial<WorkerBee>) => void;
  agentStatuses: Record<string, AgentStatus>;
  setAgentStatus: (beeId: string, status: AgentStatus) => void;
  maximizedPane: string | null;
  setMaximizedPane: (paneId: string | null) => void;
  gridLayout: GridLayout;
  setGridLayout: (layout: GridLayout) => void;
  reorderWorkerBees: (fromIndex: number, toIndex: number) => void;
  swapWorkerBees: (fromIndex: number, toIndex: number) => void;
  refitCount: number;
  refitTerminals: () => void;
  /** Panes of one workhive, in order. */
  beesOf: (workHiveId: string) => WorkerBee[];
  /** The crowned bee of one workhive, if it has one. */
  queenOf: (workHiveId: string) => WorkerBee | undefined;
  /** Crown a WorkerBee. Refused (returns false) when its own workhive already
   *  has a QueenBee — that one must be demoted or removed first. Other
   *  workHives are unaffected: every folder gets its own queen. */
  promoteToQueen: (beeId: string) => boolean;
  /** Uncrown a workhive's QueenBee; the bee returns to that folder's grid. */
  demoteQueen: (workHiveId: string) => void;
  setQueenMode: (beeId: string, mode: QueenBeeMode) => void;
}

const activeWsId = () => workerBeesHost().activeWorkHiveId();

/**
 * Two renames, both of which strand a pane rather than crash:
 *
 *  - `plane: "honeyflow"` predates the rename; that name now means the canvas.
 *  - `plane: "browser"` / `"emulator"` pointed at planes that had their own
 *    title-bar tab. Those tabs are gone, so a pane left on one is unreachable
 *    while its process keeps running.
 *
 * Either way the pane matches no plane and silently disappears, so both are
 * folded onto the board.
 */
export function migratePanesState(
  persisted: unknown,
): { workerBees: WorkerBee[]; gridLayout?: GridLayout } {
  const s = (persisted ?? {}) as { workerBees?: WorkerBee[]; gridLayout?: GridLayout };
  const STRANDED = ["honeyflow", "browser", "emulator"];
  return {
    ...s,
    workerBees: (s.workerBees ?? []).map((b) =>
      STRANDED.includes((b as { plane?: string }).plane ?? "")
        ? { ...b, plane: "honeyboard" as const }
        : b,
    ),
  };
}

export const useWorkerBeesStore = create<WorkerBeesState>()(
  persist(
    (set, get) => ({
      workerBees: [],
      addWorkerBee: (workerBee) =>
        set((state) => ({
          workerBees: [
            ...state.workerBees,
            // Panes always belong to a workhive; callers rarely care which, so
            // the active one is filled in here rather than at 20 call sites.
            { ...workerBee, workHiveId: workerBee.workHiveId ?? activeWsId() },
          ],
        })),
      removeWorkerBee: (beeId) =>
        set((state) => {
          const { [beeId]: _, ...rest } = state.agentStatuses;
          return {
            workerBees: state.workerBees.filter((b) => b.id !== beeId),
            maximizedPane: state.maximizedPane === beeId ? null : state.maximizedPane,
            agentStatuses: rest,
          };
        }),
      updateWorkerBee: (beeId, updates) =>
        set((state) => ({
          workerBees: state.workerBees.map((b) =>
            b.id === beeId ? { ...b, ...updates } : b
          ),
        })),
      agentStatuses: {},
      setAgentStatus: (beeId, status) =>
        set((state) => ({
          agentStatuses: { ...state.agentStatuses, [beeId]: status },
        })),
      maximizedPane: null,
      setMaximizedPane: (paneId) => set({ maximizedPane: paneId }),
      gridLayout: "cols2",
      setGridLayout: (layout) => set({ gridLayout: layout }),
      reorderWorkerBees: (fromIndex, toIndex) =>
        set((state) => {
          const result = Array.from(state.workerBees);
          const [removed] = result.splice(fromIndex, 1);
          result.splice(toIndex, 0, removed);
          return { workerBees: result };
        }),
      // Swap two panes in place — used by drag-and-drop so dropping A onto B trades
      // their positions (spotlight follows position), rather than insert-shifting.
      swapWorkerBees: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex < 0 || toIndex < 0 ||
            fromIndex >= state.workerBees.length || toIndex >= state.workerBees.length ||
            fromIndex === toIndex
          ) return state;
          const result = Array.from(state.workerBees);
          [result[fromIndex], result[toIndex]] = [result[toIndex], result[fromIndex]];
          return { workerBees: result };
        }),
      refitCount: 0,
      refitTerminals: () => set((state) => ({ refitCount: state.refitCount + 1 })),
      beesOf: (workHiveId) => get().workerBees.filter((b) => b.workHiveId === workHiveId),
      queenOf: (workHiveId) =>
        get().workerBees.find((b) => b.isQueen && b.workHiveId === workHiveId),
      promoteToQueen: (beeId) => {
        const bees = get().workerBees;
        const target = bees.find((b) => b.id === beeId);
        // Only agents can lead: a CLI pane, or an editor pane running one of the
        // agent extensions. Shells, browsers, emulators and tool extensions have
        // nothing to hand a role to.
        const isAgent = !target?.kind || target.kind === "agent" || (target.kind === "openvsx" && target.agentExt);
        if (!target || !isAgent) return false;
        const ws = target.workHiveId;
        if (bees.some((b) => b.isQueen && b.workHiveId === ws && b.id !== beeId)) return false;
        set({
          workerBees: bees.map((b) =>
            b.id === beeId ? { ...b, isQueen: true, queenMode: b.queenMode ?? "Steward" } : b
          ),
          maximizedPane: get().maximizedPane === beeId ? null : get().maximizedPane,
        });
        // The crowned pane lives in the right dock — open it, or the promotion
        // would leave the agent with nowhere to render.
        workerBeesHost().revealQueenDock();
        return true;
      },
      demoteQueen: (workHiveId) =>
        set((state) => ({
          workerBees: state.workerBees.map((b) =>
            b.isQueen && b.workHiveId === workHiveId ? { ...b, isQueen: false } : b
          ),
        })),
      setQueenMode: (beeId, mode) =>
        set((state) => ({
          workerBees: state.workerBees.map((b) => (b.id === beeId ? { ...b, queenMode: mode } : b)),
        })),
    }),
    {
      name: "hiveory-panes",
      storage: appStorage,
      version: 3,
      // Layout survives a restart; live process state does not — the ptys die
      // with the app, so statuses would come back as stale lies.
      partialize: (s) => ({ workerBees: s.workerBees, gridLayout: s.gridLayout }),
      migrate: migratePanesState as never,
    },
  ),
);
