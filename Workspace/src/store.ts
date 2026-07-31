import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from '@swarm/agents/storage';
import { invoke } from '@tauri-apps/api/core';
import type { TaskCard, NewCardInput } from '@swarm/tasks';
import { addCard, moveCard } from '@swarm/tasks';
import { EMPTY_TOOLBOX, type McpServerSpec, type SkillSpec, type Toolbox } from './toolbox.js';
import { applyToolbox } from './toolboxIO.js';

/** A git worktree ("tree") under a agent's repo: a separate checked-out
 *  directory on its own branch, so agents in different trees never collide. */
export interface Worktree {
  id: string;
  name: string;
  branch: string;
  path: string;
}

export type { TaskCard } from '@swarm/tasks';
export type { ColumnId, ColumnDefinition } from '@swarm/tasks';
export { DEFAULT_COLUMNS } from '@swarm/tasks';

export interface Workspace {
  id: string;
  name: string;
  color: string;
  /** The one folder this agent works in. Its `.pheromone/` is this
   *  agent's brain; no two workspaces may bind the same folder. */
  boundProjectPath: string;
  taskCards: TaskCard[];
  /** True while the name was derived rather than typed by the user. An
   *  auto-named agent renames itself after whatever folder it binds; once
   *  the user names it, the name is theirs and nothing overwrites it. */
  autoNamed?: boolean;
  /** Git worktrees created under this agent's repo. */
  worktrees?: Worktree[];
  /** Skills and MCP servers every agent in this agent gets. Applied by
   *  writing them into the folder, so Agents and the Lead pick them
   *  up without any per-agent wiring. See toolbox.ts. */
  toolbox?: Toolbox;
  activeMissionId?: string;
  isDeleting?: boolean;
  deletePhase?: 'queued' | 'deleting';
}

export type DeleteState = { isDeleting: boolean; phase: 'queued' | 'deleting' };

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  boardOpen: boolean;
  renamingWorkspaceId: string | null;

  addWorkspace: (agent: Workspace) => void;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string) => void;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
  renameWorkspace: (id: string, name: string) => void;
  setWorkspaceColor: (id: string, color: string) => void;
  getActiveWorkspace: () => Workspace | undefined;
  setBoardOpen: (open: boolean) => void;
  setRenamingWorkspaceId: (id: string | null) => void;

  addTask: (workspaceId: string, title: string, description?: string) => void;
  /** Add a fully-specified card (dispatch: cli, role, agent link, branch). */
  addTaskCard: (workspaceId: string, input: NewCardInput) => void;
  setTasks: (workspaceId: string, tasks: TaskCard[]) => void;
  moveTask: (workspaceId: string, taskId: string, targetColumn: import('@swarm/tasks').ColumnId, targetIndex?: number) => void;
  activateWorkspaceAndSync: (id: string) => void;

  /** Create a git worktree under a agent (runs `git worktree add`). Throws on failure. */
  createWorktree: (workspaceId: string, name: string) => Promise<Worktree>;
  /** Remove a agent's worktree (runs `git worktree remove --force`). */
  removeWorktree: (workspaceId: string, worktreeId: string) => Promise<void>;
  /** Merge a worktree's branch back into the main repo, then remove it. */
  mergeWorktree: (workspaceId: string, worktreeId: string) => Promise<void>;

  /** Replace a agent's toolbox and write it into every tree it owns, so
   *  every agent already running there sees the change on its next read. */
  setToolbox: (workspaceId: string, toolbox: Toolbox) => Promise<void>;
  setSkills: (workspaceId: string, skills: SkillSpec[]) => Promise<void>;
  setMcpServers: (workspaceId: string, servers: McpServerSpec[]) => Promise<void>;
  /** Re-write the current toolbox (after opening a folder or adding a tree). */
  reapplyToolbox: (workspaceId: string) => Promise<void>;

  deleteWorkspace: (id: string) => void;
  commitDeleteWorkspace: (id: string) => void;
  cancelDeleteWorkspace: (id: string) => void;

  /**
   * Bind a folder to a agent, keeping the one-folder-one-agent rule:
   * if another agent already owns that folder, switch to it instead of
   * creating a second brain over the same `.pheromone/`. Returns the agent id
   * that ends up bound.
   */
  bindFolder: (workspaceId: string, folder: string) => string;
  /** Open a folder as a agent; creates the first swarm when there are none. */
  openFolder: (folder: string, color?: string) => string;
}

const AGENT_COLORS = ['#c9a227', '#8fae7a', '#7f9db8', '#b79ae0', '#c66b5a', '#7fb3ab'];

let wsSeq = 0;
function nextWsId() { return `ws-${Date.now()}-${wsSeq++}`; }

export const useWorkspaceStore = create<WorkspaceState>()(persist((set, get) => ({
  // No swarms until the user opens a project. A placeholder "Untitled" swarm is
  // a lie: it has no folder, no memory and no trees, so it can hold nothing.
  workspaces: [],
  activeWorkspaceId: '',
  boardOpen: false,
  renamingWorkspaceId: null,

  addWorkspace: (agent) =>
    set((state) => ({ workspaces: [...state.workspaces, agent], activeWorkspaceId: agent.id })),

  removeWorkspace: (id) =>
    set((state) => {
      const remaining = state.workspaces.filter((w) => w.id !== id);
      return {
        workspaces: remaining,
        activeWorkspaceId:
          state.activeWorkspaceId === id ? (remaining[0]?.id ?? '') : state.activeWorkspaceId,
      };
    }),

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  setBoardOpen: (open) => set({ boardOpen: open }),
  setRenamingWorkspaceId: (id) => set({ renamingWorkspaceId: id }),

  updateWorkspace: (id, updates) =>
    set((state) => ({ workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, ...updates } : w)) })),

  // A rename is the user claiming the name — it stops tracking the folder.
  renameWorkspace: (id, name) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, name, autoNamed: false } : w,
      ),
    })),

  setWorkspaceColor: (id, color) =>
    set((state) => ({ workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, color } : w)) })),

  getActiveWorkspace: () => get().workspaces.find((w) => w.id === get().activeWorkspaceId),

  // Card semantics belong to Tasks — this store only holds the array.
  addTask: (workspaceId, title, description) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, taskCards: addCard(w.taskCards, { title, description }) }
          : w,
      ),
    })),

  addTaskCard: (workspaceId, input) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, taskCards: addCard(w.taskCards, input) } : w,
      ),
    })),

  setTasks: (workspaceId, tasks) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === workspaceId ? { ...w, taskCards: tasks } : w)),
    })),

  moveTask: (workspaceId, taskId, targetColumn, targetIndex) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId
          ? { ...w, taskCards: moveCard(w.taskCards, taskId, targetColumn, targetIndex) }
          : w,
      ),
    })),

  activateWorkspaceAndSync: (id) => { set({ activeWorkspaceId: id }); },

  createWorktree: async (workspaceId, name) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws) throw new Error('Workspace not found');
    if (!ws.boundProjectPath) throw new Error('Workspace has no bound repo — bind a project folder first');
    // git-safe id from the tree name; keep it unique within the agent.
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tree';
    const existing = new Set((ws.worktrees ?? []).map((t) => t.id));
    let taskId = base, n = 2;
    while (existing.has(taskId)) taskId = `${base}-${n++}`;
    const info = await invoke<{ path: string; branch: string; task_id: string }>('create_worktree', {
      projectPath: ws.boundProjectPath,
      taskId,
    });
    // Backend may reuse/suffix (e.g. leftover agent/style branch → same tree or style-2).
    const id = info.task_id || taskId;
    const already = (ws.worktrees ?? []).find((t) => t.id === id || t.path === info.path);
    if (already) return already;
    const tree: Worktree = { id, name: name.trim() || id, branch: info.branch, path: info.path };
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, worktrees: [...(w.worktrees ?? []), tree] } : w,
      ),
    }));
    // A fresh tree starts as a bare checkout: without this the agents spawned
    // in it would be the only ones in the agent with no skills and no MCP.
    get().reapplyToolbox(workspaceId).catch(() => {});
    return tree;
  },

  removeWorktree: async (workspaceId, worktreeId) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    const tree = ws?.worktrees?.find((t) => t.id === worktreeId);
    if (!ws || !tree) return;
    await invoke('remove_worktree', { projectPath: ws.boundProjectPath, worktreePath: tree.path });
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, worktrees: (w.worktrees ?? []).filter((t) => t.id !== worktreeId) } : w,
      ),
    }));
  },

  mergeWorktree: async (workspaceId, worktreeId) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    const tree = ws?.worktrees?.find((t) => t.id === worktreeId);
    if (!ws || !tree) throw new Error('Tree not found');
    // Merges tree.branch into the main repo's current branch, then removes the
    // worktree. Throws on merge conflict (git leaves the merge in progress).
    await invoke('merge_worktree', { projectPath: ws.boundProjectPath, branch: tree.branch, worktreePath: tree.path });
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, worktrees: (w.worktrees ?? []).filter((t) => t.id !== worktreeId) } : w,
      ),
    }));
  },

  setToolbox: async (workspaceId, toolbox) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === workspaceId ? { ...w, toolbox } : w)),
    }));
    await get().reapplyToolbox(workspaceId);
  },

  setSkills: async (workspaceId, skills) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    await get().setToolbox(workspaceId, { ...(ws?.toolbox ?? EMPTY_TOOLBOX), skills });
  },

  setMcpServers: async (workspaceId, mcpServers) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    await get().setToolbox(workspaceId, { ...(ws?.toolbox ?? EMPTY_TOOLBOX), mcpServers });
  },

  reapplyToolbox: async (workspaceId) => {
    const ws = get().workspaces.find((w) => w.id === workspaceId);
    if (!ws?.boundProjectPath) return;
    await applyToolbox(ws.boundProjectPath, ws.worktrees, ws.toolbox ?? EMPTY_TOOLBOX);
  },

  deleteWorkspace: (id) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, isDeleting: true, deletePhase: 'queued' as const } : w
      ),
    })),

  commitDeleteWorkspace: (id) =>
    set((state) => {
      const remaining = state.workspaces.filter((w) => w.id !== id);
      return {
        workspaces: remaining,
        activeWorkspaceId:
          state.activeWorkspaceId === id ? (remaining[0]?.id ?? '') : state.activeWorkspaceId,
      };
    }),

  cancelDeleteWorkspace: (id) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, isDeleting: false, deletePhase: undefined } : w
      ),
    })),

  /**
   * Open a folder as a agent — the one entry point every caller uses.
   * Reuses the swarm already bound to it, otherwise adopts the active swarm if it
   * is still unbound, otherwise starts a new swarm named after the folder. With
   * no swarms at all (a fresh install) this creates the first one.
   */
  openFolder: (folder, color) => {
    const state = get();
    const owner = state.workspaces.find((w) => samePath(w.boundProjectPath, folder));
    if (owner) {
      set({ activeWorkspaceId: owner.id });
      return owner.id;
    }
    const active = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
    if (active && !active.boundProjectPath) return get().bindFolder(active.id, folder);

    const id = nextWsId();
    set((s) => ({
      workspaces: [
        ...s.workspaces,
        {
          id,
          name: folderName(folder),
          autoNamed: true,
          color: color ?? AGENT_COLORS[s.workspaces.length % AGENT_COLORS.length],
          boundProjectPath: folder,
          taskCards: [],
        },
      ],
      activeWorkspaceId: id,
    }));
    return id;
  },

  bindFolder: (workspaceId, folder) => {
    const owner = get().workspaces.find(
      (w) => w.id !== workspaceId && samePath(w.boundProjectPath, folder),
    );
    if (owner) {
      set({ activeWorkspaceId: owner.id });
      return owner.id;
    }
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId
          // An unnamed agent takes the folder's name — binding a project is
          // the moment it stops being "a new agent" and becomes that one.
          ? { ...w, boundProjectPath: folder, name: w.autoNamed ? folderName(folder) : w.name }
          : w,
      ),
      activeWorkspaceId: workspaceId,
    }));
    return workspaceId;
  },
}), {
  name: 'swarm-workspaces',
  storage: appStorage,
  // Folders, boards and trees are the durable part; transient UI (which board
  // drawer is open, a half-finished rename) is not worth restoring.
  partialize: (s) => ({
    workspaces: s.workspaces.map(({ isDeleting, deletePhase, ...w }) => w),
    activeWorkspaceId: s.activeWorkspaceId,
  }),
}));

/** The last path segment — what a agent is called when it isn't named. */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
}

/** Windows paths differ in slash + case yet name the same folder. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
  return norm(a) === norm(b);
}

/** The folder the active agent is bound to — the app's only "current project". */
export function useActiveProjectPath(): string | null {
  return useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.boundProjectPath || null,
  );
}

/** Imperative form for stores/tools that run outside React. */
export function getActiveProjectPath(): string | null {
  const s = useWorkspaceStore.getState();
  return s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.boundProjectPath || null;
}

/** Every distinct folder currently bound to a agent. */
export function boundFolders(): string[] {
  return Array.from(
    new Set(
      useWorkspaceStore.getState().workspaces
        .map((w) => w.boundProjectPath)
        .filter((p): p is string => !!p),
    ),
  );
}

/** The agent that owns a folder, if any. */
export function workspaceForFolder(folder: string) {
  return useWorkspaceStore.getState().workspaces.find((w) => samePath(w.boundProjectPath, folder));
}
