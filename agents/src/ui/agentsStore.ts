import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appStorage } from "./persistStorage.js";
import type { LeadMode } from "@swarm/lead";
import { agentsHost } from "./host.js";

export interface Agent {
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
  plane?: 'board' | 'browser' | 'emulator';
  /** browser panes only — page to open on mount */
  url?: string;
  /** openvsx panes — the Open-VSX extension id to install + open, and its icon */
  extensionId?: string;
  iconUrl?: string;
  /** An 'openvsx' pane running an AI coding agent (Claude Code, Kilo Code,
   *  OpenChamber). These join the swarm like Agents and can wear the crown;
   *  plain tool extensions cannot. */
  agentExt?: boolean;
  /** Which workswarm worktree ("tree") this agent operates in. Undefined = the
   *  workswarm's main bound repo path. Changing it respawns the agent there. */
  worktreeId?: string;
  /** Which workswarm (and therefore which folder) this pane belongs to. Every
   *  workswarm's panes live in this one store; the grid renders only the active
   *  workswarm's, so switching folders never tears another folder's agents down. */
  workspaceId?: string;
  /** At most one swarm per workswarm carries the crown. The Lead is an
   *  ordinary CLI agent promoted to lead: it leaves the grid and runs in the
   *  Lead dock tab for its own folder. */
  isLead?: boolean;
  /** Which Lead role prompt was last sent into this CLI. */
  leadMode?: LeadMode;
  /** Model and effort this swarm was summoned with, when the caller pinned them.
   *  Kept for display and so a respawn reuses the same configuration. */
  model?: string;
  effort?: string;
}

export type AgentStatus = 'launching' | 'running' | 'idle' | 'error' | 'done';

// Pane layout presets. The five picker presets (cols2…grid4x2) pin a column
// count (grid* also pin rows); legacy values are kept for the Lead tool and
// any persisted workspaces.
export type GridLayout =
  | "cols2" | "cols3" | "cols4" | "grid2x2" | "grid3x2" | "grid4x2" | "focus" | "focus4"
  | "auto" | "grid" | "cols" | "rows" | "master" | 1 | 2 | 3 | 4;

interface AgentsState {
  agents: Agent[];
  addAgent: (agent: Agent) => void;
  removeAgent: (swarmId: string) => void;
  updateAgent: (swarmId: string, updates: Partial<Agent>) => void;
  agentStatuses: Record<string, AgentStatus>;
  setAgentStatus: (swarmId: string, status: AgentStatus) => void;
  maximizedPane: string | null;
  setMaximizedPane: (paneId: string | null) => void;
  gridLayout: GridLayout;
  setGridLayout: (layout: GridLayout) => void;
  reorderAgents: (fromIndex: number, toIndex: number) => void;
  swapAgents: (fromIndex: number, toIndex: number) => void;
  refitCount: number;
  refitTerminals: () => void;
  /** Panes of one workswarm, in order. */
  swarmsOf: (workspaceId: string) => Agent[];
  /** The crowned swarm of one workswarm, if it has one. */
  leadOf: (workspaceId: string) => Agent | undefined;
  /** Crown a Agent. Refused (returns false) when its own workswarm already
   *  has a Lead — that one must be demoted or removed first. Other
   *  workspaces are unaffected: every folder gets its own lead. */
  promoteToLead: (swarmId: string) => boolean;
  /** Uncrown a workswarm's Lead; the swarm returns to that folder's grid. */
  demoteLead: (workspaceId: string) => void;
  setLeadMode: (swarmId: string, mode: LeadMode) => void;
}

const activeWsId = () => agentsHost().activeWorkspaceId();

/**
 * Three renames, all of which strand a pane rather than crash:
 *
 *  - `plane: "honeyflow"` predates the rename; that name now means the canvas.
 *  - `plane: "honeyboard"` is the name that replaced it, before the Hiveory ->
 *    Swarm rename dropped the "honey" prefix in favour of the plain "board".
 *  - `plane: "browser"` / `"emulator"` pointed at planes that had their own
 *    title-bar tab. Those tabs are gone, so a pane left on one is unreachable
 *    while its process keeps running.
 *
 * Either way the pane matches no plane and silently disappears, so all are
 * folded onto the board.
 */
export function migratePanesState(
  persisted: unknown,
): { agents: Agent[]; gridLayout?: GridLayout } {
  const s = (persisted ?? {}) as { agents?: Agent[]; gridLayout?: GridLayout };
  const STRANDED = ["honeyflow", "honeyboard", "browser", "emulator"];
  return {
    ...s,
    agents: (s.agents ?? []).map((b) =>
      STRANDED.includes((b as { plane?: string }).plane ?? "")
        ? { ...b, plane: "board" as const }
        : b,
    ),
  };
}

export const useAgentsStore = create<AgentsState>()(
  persist(
    (set, get) => ({
      agents: [],
      addAgent: (agent) =>
        set((state) => ({
          agents: [
            ...state.agents,
            // Panes always belong to a workswarm; callers rarely care which, so
            // the active one is filled in here rather than at 20 call sites.
            { ...agent, workspaceId: agent.workspaceId ?? activeWsId() },
          ],
        })),
      removeAgent: (swarmId) =>
        set((state) => {
          const { [swarmId]: _, ...rest } = state.agentStatuses;
          return {
            agents: state.agents.filter((b) => b.id !== swarmId),
            maximizedPane: state.maximizedPane === swarmId ? null : state.maximizedPane,
            agentStatuses: rest,
          };
        }),
      updateAgent: (swarmId, updates) =>
        set((state) => ({
          agents: state.agents.map((b) =>
            b.id === swarmId ? { ...b, ...updates } : b
          ),
        })),
      agentStatuses: {},
      setAgentStatus: (swarmId, status) =>
        set((state) => ({
          agentStatuses: { ...state.agentStatuses, [swarmId]: status },
        })),
      maximizedPane: null,
      setMaximizedPane: (paneId) => set({ maximizedPane: paneId }),
      // "auto", not a fixed grid: the host picks the column count from how many
      // panes are open and the board's aspect, so three panes on a wide screen
      // get three columns instead of a 2x2 with a hole in it. A pinned "cols2"
      // was right for two panes and wrong for every other count.
      gridLayout: "auto",
      setGridLayout: (layout) => set({ gridLayout: layout }),
      reorderAgents: (fromIndex, toIndex) =>
        set((state) => {
          const result = Array.from(state.agents);
          const [removed] = result.splice(fromIndex, 1);
          result.splice(toIndex, 0, removed);
          return { agents: result };
        }),
      // Swap two panes in place — used by drag-and-drop so dropping A onto B trades
      // their positions (spotlight follows position), rather than insert-shifting.
      swapAgents: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex < 0 || toIndex < 0 ||
            fromIndex >= state.agents.length || toIndex >= state.agents.length ||
            fromIndex === toIndex
          ) return state;
          const result = Array.from(state.agents);
          [result[fromIndex], result[toIndex]] = [result[toIndex], result[fromIndex]];
          return { agents: result };
        }),
      refitCount: 0,
      refitTerminals: () => set((state) => ({ refitCount: state.refitCount + 1 })),
      swarmsOf: (workspaceId) => get().agents.filter((b) => b.workspaceId === workspaceId),
      leadOf: (workspaceId) =>
        get().agents.find((b) => b.isLead && b.workspaceId === workspaceId),
      promoteToLead: (swarmId) => {
        const swarms = get().agents;
        const target = swarms.find((b) => b.id === swarmId);
        // Only agents can lead: a CLI pane, or an editor pane running one of the
        // agent extensions. Shells, browsers, emulators and tool extensions have
        // nothing to hand a role to.
        const isAgent = !target?.kind || target.kind === "agent" || (target.kind === "openvsx" && target.agentExt);
        if (!target || !isAgent) return false;
        const ws = target.workspaceId;
        if (swarms.some((b) => b.isLead && b.workspaceId === ws && b.id !== swarmId)) return false;
        set({
          agents: swarms.map((b) =>
            b.id === swarmId ? { ...b, isLead: true, leadMode: b.leadMode ?? "Steward" } : b
          ),
          maximizedPane: get().maximizedPane === swarmId ? null : get().maximizedPane,
        });
        // The crowned pane lives in the right dock — open it, or the promotion
        // would leave the agent with nowhere to render.
        agentsHost().revealLeadDock();
        return true;
      },
      demoteLead: (workspaceId) =>
        set((state) => ({
          agents: state.agents.map((b) =>
            b.isLead && b.workspaceId === workspaceId ? { ...b, isLead: false } : b
          ),
        })),
      setLeadMode: (swarmId, mode) =>
        set((state) => ({
          agents: state.agents.map((b) => (b.id === swarmId ? { ...b, leadMode: mode } : b)),
        })),
    }),
    {
      name: "swarm-panes",
      storage: appStorage,
      version: 4,
      // Layout survives a restart; live process state does not — the ptys die
      // with the app, so statuses would come back as stale lies.
      partialize: (s) => ({ agents: s.agents, gridLayout: s.gridLayout }),
      migrate: migratePanesState as never,
    },
  ),
);
