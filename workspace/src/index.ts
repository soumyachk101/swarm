// Workspace: one folder, one swarm. Owns the model of a agent — its bound
// project folder, its git worktrees, its board — and the UI for managing them.
// Swarm only renders these; none of this logic lives in the app shell.
export {
  useWorkspaceStore, samePath, folderName,
  useActiveProjectPath, getActiveProjectPath, boundFolders, workspaceForFolder,
} from './store.js';
export type { Workspace, Worktree, DeleteState } from './store.js';
export type { TaskCard, ColumnId, ColumnDefinition } from './store.js';
export { DEFAULT_COLUMNS } from './store.js';
export { useProjectStore } from "./openFiles.js";
