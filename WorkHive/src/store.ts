import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { appStorage } from '@hiveory/worker-bees/storage';
import { invoke } from '@tauri-apps/api/core';
import type { TaskCard, NewCardInput } from '@hiveory/taskcomb';
import { addCard, moveCard } from '@hiveory/taskcomb';
import { EMPTY_TOOLBOX, type McpServerSpec, type SkillSpec, type Toolbox } from './toolbox.js';
import { applyToolbox } from './toolboxIO.js';

/** A git worktree ("tree") under a workhive's repo: a separate checked-out
 *  directory on its own branch, so agents in different trees never collide. */
export interface Worktree {
  id: string;
  name: string;
  branch: string;
  path: string;
}

export type { TaskCard } from '@hiveory/taskcomb';
export type { ColumnId, ColumnDefinition } from '@hiveory/taskcomb';
export { DEFAULT_COLUMNS } from '@hiveory/taskcomb';

export interface WorkHive {
  id: string;
  name: string;
  color: string;
  /** The one folder this workhive works in. Its `.nectar/` is this
   *  workhive's brain; no two workHives may bind the same folder. */
  boundProjectPath: string;
  taskCards: TaskCard[];
  /** True while the name was derived rather than typed by the user. An
   *  auto-named workhive renames itself after whatever folder it binds; once
   *  the user names it, the name is theirs and nothing overwrites it. */
  autoNamed?: boolean;
  /** Git worktrees created under this workhive's repo. */
  worktrees?: Worktree[];
  /** Skills and MCP servers every agent in this workhive gets. Applied by
   *  writing them into the folder, so WorkerBees and the QueenBee pick them
   *  up without any per-agent wiring. See toolbox.ts. */
  toolbox?: Toolbox;
  activeMissionId?: string;
  isDeleting?: boolean;
  deletePhase?: 'queued' | 'deleting';
}

export type DeleteState = { isDeleting: boolean; phase: 'queued' | 'deleting' };

interface WorkHiveState {
  workHives: WorkHive[];
  activeWorkHiveId: string;
  boardOpen: boolean;
  renamingWorkHiveId: string | null;

  addWorkHive: (workhive: WorkHive) => void;
  removeWorkHive: (id: string) => void;
  setActiveWorkHive: (id: string) => void;
  updateWorkHive: (id: string, updates: Partial<WorkHive>) => void;
  renameWorkHive: (id: string, name: string) => void;
  setWorkHiveColor: (id: string, color: string) => void;
  getActiveWorkHive: () => WorkHive | undefined;
  setBoardOpen: (open: boolean) => void;
  setRenamingWorkHiveId: (id: string | null) => void;

  addTask: (workHiveId: string, title: string, description?: string) => void;
  /** Add a fully-specified card (dispatch: cli, role, agent link, branch). */
  addTaskCard: (workHiveId: string, input: NewCardInput) => void;
  setTasks: (workHiveId: string, tasks: TaskCard[]) => void;
  moveTask: (workHiveId: string, taskId: string, targetColumn: import('@hiveory/taskcomb').ColumnId, targetIndex?: number) => void;
  activateWorkHiveAndSync: (id: string) => void;

  /** Create a git worktree under a workhive (runs `git worktree add`). Throws on failure. */
  createWorktree: (workHiveId: string, name: string) => Promise<Worktree>;
  /** Remove a workhive's worktree (runs `git worktree remove --force`). */
  removeWorktree: (workHiveId: string, worktreeId: string) => Promise<void>;
  /** Merge a worktree's branch back into the main repo, then remove it. */
  mergeWorktree: (workHiveId: string, worktreeId: string) => Promise<void>;

  /** Replace a workhive's toolbox and write it into every tree it owns, so
   *  every agent already running there sees the change on its next read. */
  setToolbox: (workHiveId: string, toolbox: Toolbox) => Promise<void>;
  setSkills: (workHiveId: string, skills: SkillSpec[]) => Promise<void>;
  setMcpServers: (workHiveId: string, servers: McpServerSpec[]) => Promise<void>;
  /** Re-write the current toolbox (after opening a folder or adding a tree). */
  reapplyToolbox: (workHiveId: string) => Promise<void>;

  deleteWorkHive: (id: string) => void;
  commitDeleteWorkHive: (id: string) => void;
  cancelDeleteWorkHive: (id: string) => void;

  /**
   * Bind a folder to a workhive, keeping the one-folder-one-workhive rule:
   * if another workhive already owns that folder, switch to it instead of
   * creating a second brain over the same `.nectar/`. Returns the workhive id
   * that ends up bound.
   */
  bindFolder: (workHiveId: string, folder: string) => string;
  /** Open a folder as a workhive; creates the first hive when there are none. */
  openFolder: (folder: string, color?: string) => string;
}

const WORKHIVE_COLORS = ['#c9a227', '#8fae7a', '#7f9db8', '#b79ae0', '#c66b5a', '#7fb3ab'];

let wsSeq = 0;
function nextWsId() { return `ws-${Date.now()}-${wsSeq++}`; }

export const useWorkHiveStore = create<WorkHiveState>()(persist((set, get) => ({
  // No hives until the user opens a project. A placeholder "Untitled" hive is
  // a lie: it has no folder, no memory and no trees, so it can hold nothing.
  workHives: [],
  activeWorkHiveId: '',
  boardOpen: false,
  renamingWorkHiveId: null,

  addWorkHive: (workhive) =>
    set((state) => ({ workHives: [...state.workHives, workhive], activeWorkHiveId: workhive.id })),

  removeWorkHive: (id) =>
    set((state) => {
      const remaining = state.workHives.filter((w) => w.id !== id);
      return {
        workHives: remaining,
        activeWorkHiveId:
          state.activeWorkHiveId === id ? (remaining[0]?.id ?? '') : state.activeWorkHiveId,
      };
    }),

  setActiveWorkHive: (id) => set({ activeWorkHiveId: id }),
  setBoardOpen: (open) => set({ boardOpen: open }),
  setRenamingWorkHiveId: (id) => set({ renamingWorkHiveId: id }),

  updateWorkHive: (id, updates) =>
    set((state) => ({ workHives: state.workHives.map((w) => (w.id === id ? { ...w, ...updates } : w)) })),

  // A rename is the user claiming the name — it stops tracking the folder.
  renameWorkHive: (id, name) =>
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === id ? { ...w, name, autoNamed: false } : w,
      ),
    })),

  setWorkHiveColor: (id, color) =>
    set((state) => ({ workHives: state.workHives.map((w) => (w.id === id ? { ...w, color } : w)) })),

  getActiveWorkHive: () => get().workHives.find((w) => w.id === get().activeWorkHiveId),

  // Card semantics belong to TaskComb — this store only holds the array.
  addTask: (workHiveId, title, description) =>
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === workHiveId
          ? { ...w, taskCards: addCard(w.taskCards, { title, description }) }
          : w,
      ),
    })),

  addTaskCard: (workHiveId, input) =>
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === workHiveId ? { ...w, taskCards: addCard(w.taskCards, input) } : w,
      ),
    })),

  setTasks: (workHiveId, tasks) =>
    set((state) => ({
      workHives: state.workHives.map((w) => (w.id === workHiveId ? { ...w, taskCards: tasks } : w)),
    })),

  moveTask: (workHiveId, taskId, targetColumn, targetIndex) =>
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === workHiveId
          ? { ...w, taskCards: moveCard(w.taskCards, taskId, targetColumn, targetIndex) }
          : w,
      ),
    })),

  activateWorkHiveAndSync: (id) => { set({ activeWorkHiveId: id }); },

  createWorktree: async (workHiveId, name) => {
    const ws = get().workHives.find((w) => w.id === workHiveId);
    if (!ws) throw new Error('WorkHive not found');
    if (!ws.boundProjectPath) throw new Error('WorkHive has no bound repo — bind a project folder first');
    // git-safe id from the tree name; keep it unique within the workhive.
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
      workHives: state.workHives.map((w) =>
        w.id === workHiveId ? { ...w, worktrees: [...(w.worktrees ?? []), tree] } : w,
      ),
    }));
    // A fresh tree starts as a bare checkout: without this the agents spawned
    // in it would be the only ones in the workhive with no skills and no MCP.
    get().reapplyToolbox(workHiveId).catch(() => {});
    return tree;
  },

  removeWorktree: async (workHiveId, worktreeId) => {
    const ws = get().workHives.find((w) => w.id === workHiveId);
    const tree = ws?.worktrees?.find((t) => t.id === worktreeId);
    if (!ws || !tree) return;
    await invoke('remove_worktree', { projectPath: ws.boundProjectPath, worktreePath: tree.path });
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === workHiveId ? { ...w, worktrees: (w.worktrees ?? []).filter((t) => t.id !== worktreeId) } : w,
      ),
    }));
  },

  mergeWorktree: async (workHiveId, worktreeId) => {
    const ws = get().workHives.find((w) => w.id === workHiveId);
    const tree = ws?.worktrees?.find((t) => t.id === worktreeId);
    if (!ws || !tree) throw new Error('Tree not found');
    // Merges tree.branch into the main repo's current branch, then removes the
    // worktree. Throws on merge conflict (git leaves the merge in progress).
    await invoke('merge_worktree', { projectPath: ws.boundProjectPath, branch: tree.branch, worktreePath: tree.path });
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === workHiveId ? { ...w, worktrees: (w.worktrees ?? []).filter((t) => t.id !== worktreeId) } : w,
      ),
    }));
  },

  setToolbox: async (workHiveId, toolbox) => {
    set((state) => ({
      workHives: state.workHives.map((w) => (w.id === workHiveId ? { ...w, toolbox } : w)),
    }));
    await get().reapplyToolbox(workHiveId);
  },

  setSkills: async (workHiveId, skills) => {
    const ws = get().workHives.find((w) => w.id === workHiveId);
    await get().setToolbox(workHiveId, { ...(ws?.toolbox ?? EMPTY_TOOLBOX), skills });
  },

  setMcpServers: async (workHiveId, mcpServers) => {
    const ws = get().workHives.find((w) => w.id === workHiveId);
    await get().setToolbox(workHiveId, { ...(ws?.toolbox ?? EMPTY_TOOLBOX), mcpServers });
  },

  reapplyToolbox: async (workHiveId) => {
    const ws = get().workHives.find((w) => w.id === workHiveId);
    if (!ws?.boundProjectPath) return;
    await applyToolbox(ws.boundProjectPath, ws.worktrees, ws.toolbox ?? EMPTY_TOOLBOX);
  },

  deleteWorkHive: (id) =>
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === id ? { ...w, isDeleting: true, deletePhase: 'queued' as const } : w
      ),
    })),

  commitDeleteWorkHive: (id) =>
    set((state) => {
      const remaining = state.workHives.filter((w) => w.id !== id);
      return {
        workHives: remaining,
        activeWorkHiveId:
          state.activeWorkHiveId === id ? (remaining[0]?.id ?? '') : state.activeWorkHiveId,
      };
    }),

  cancelDeleteWorkHive: (id) =>
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === id ? { ...w, isDeleting: false, deletePhase: undefined } : w
      ),
    })),

  /**
   * Open a folder as a workhive — the one entry point every caller uses.
   * Reuses the hive already bound to it, otherwise adopts the active hive if it
   * is still unbound, otherwise starts a new hive named after the folder. With
   * no hives at all (a fresh install) this creates the first one.
   */
  openFolder: (folder, color) => {
    const state = get();
    const owner = state.workHives.find((w) => samePath(w.boundProjectPath, folder));
    if (owner) {
      set({ activeWorkHiveId: owner.id });
      return owner.id;
    }
    const active = state.workHives.find((w) => w.id === state.activeWorkHiveId);
    if (active && !active.boundProjectPath) return get().bindFolder(active.id, folder);

    const id = nextWsId();
    set((s) => ({
      workHives: [
        ...s.workHives,
        {
          id,
          name: folderName(folder),
          autoNamed: true,
          color: color ?? WORKHIVE_COLORS[s.workHives.length % WORKHIVE_COLORS.length],
          boundProjectPath: folder,
          taskCards: [],
        },
      ],
      activeWorkHiveId: id,
    }));
    return id;
  },

  bindFolder: (workHiveId, folder) => {
    const owner = get().workHives.find(
      (w) => w.id !== workHiveId && samePath(w.boundProjectPath, folder),
    );
    if (owner) {
      set({ activeWorkHiveId: owner.id });
      return owner.id;
    }
    set((state) => ({
      workHives: state.workHives.map((w) =>
        w.id === workHiveId
          // An unnamed workhive takes the folder's name — binding a project is
          // the moment it stops being "a new workhive" and becomes that one.
          ? { ...w, boundProjectPath: folder, name: w.autoNamed ? folderName(folder) : w.name }
          : w,
      ),
      activeWorkHiveId: workHiveId,
    }));
    return workHiveId;
  },
}), {
  name: 'hiveory-workHives',
  storage: appStorage,
  // Folders, boards and trees are the durable part; transient UI (which board
  // drawer is open, a half-finished rename) is not worth restoring.
  partialize: (s) => ({
    workHives: s.workHives.map(({ isDeleting, deletePhase, ...w }) => w),
    activeWorkHiveId: s.activeWorkHiveId,
  }),
}));

/** The last path segment — what a workhive is called when it isn't named. */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || 'Workspace';
}

/** Windows paths differ in slash + case yet name the same folder. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
  return norm(a) === norm(b);
}

/** The folder the active workhive is bound to — the app's only "current project". */
export function useActiveProjectPath(): string | null {
  return useWorkHiveStore(
    (s) => s.workHives.find((w) => w.id === s.activeWorkHiveId)?.boundProjectPath || null,
  );
}

/** Imperative form for stores/tools that run outside React. */
export function getActiveProjectPath(): string | null {
  const s = useWorkHiveStore.getState();
  return s.workHives.find((w) => w.id === s.activeWorkHiveId)?.boundProjectPath || null;
}

/** Every distinct folder currently bound to a workhive. */
export function boundFolders(): string[] {
  return Array.from(
    new Set(
      useWorkHiveStore.getState().workHives
        .map((w) => w.boundProjectPath)
        .filter((p): p is string => !!p),
    ),
  );
}

/** The workhive that owns a folder, if any. */
export function workHiveForFolder(folder: string) {
  return useWorkHiveStore.getState().workHives.find((w) => samePath(w.boundProjectPath, folder));
}
