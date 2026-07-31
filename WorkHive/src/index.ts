// WorkHive: one folder, one hive. Owns the model of a workhive — its bound
// project folder, its git worktrees, its board — and the UI for managing them.
// Hive only renders these; none of this logic lives in the app shell.
export {
  useWorkHiveStore, samePath, folderName,
  useActiveProjectPath, getActiveProjectPath, boundFolders, workHiveForFolder,
} from './store.js';
export type { WorkHive, Worktree, DeleteState } from './store.js';
export type { TaskCard, ColumnId, ColumnDefinition } from './store.js';
export { DEFAULT_COLUMNS } from './store.js';
export { useProjectStore } from "./openFiles.js";
