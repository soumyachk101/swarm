import { create } from 'zustand';

// Tracks worktrees created by dispatch so they can be approved (merged) or
// discarded later. Without this the branch/path returned by create_worktree is
// lost and merge_worktree has nothing to act on.
//
// Keyed by folder: two folders can dispatch tasks with the same id, and an
// approval must merge the branch of the folder that asked for it.
export interface DispatchedTask {
  taskId: string;
  title: string;
  cli: string;
  branch: string;
  worktreePath: string;
  dispatchedAt: number;
}

interface DispatchState {
  byFolder: Record<string, DispatchedTask[]>;
  record: (folder: string, task: Omit<DispatchedTask, 'dispatchedAt'>) => void;
  remove: (folder: string, taskId: string) => void;
  get: (folder: string, taskId: string) => DispatchedTask | undefined;
  listFor: (folder: string) => DispatchedTask[];
}

export const useDispatchStore = create<DispatchState>((set, get) => ({
  byFolder: {},
  record: (folder, task) =>
    set((s) => ({
      byFolder: {
        ...s.byFolder,
        [folder]: [
          ...(s.byFolder[folder] ?? []).filter((d) => d.taskId !== task.taskId),
          { ...task, dispatchedAt: Date.now() },
        ],
      },
    })),
  remove: (folder, taskId) =>
    set((s) => ({
      byFolder: {
        ...s.byFolder,
        [folder]: (s.byFolder[folder] ?? []).filter((d) => d.taskId !== taskId),
      },
    })),
  get: (folder, taskId) => (get().byFolder[folder] ?? []).find((d) => d.taskId === taskId),
  listFor: (folder) => get().byFolder[folder] ?? [],
}));
