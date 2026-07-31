// SwarmMind's Tauri-side surface: the adapters that implement its ports against
// Rust IPC, plus the goal-to-worktrees dispatch pipeline and the bookkeeping of
// what is waiting for approval. Orchestration policy lives in ./core — this
// layer only performs the side effects it asks for.
export { TauriWorktreeOps, tauriHandoffFs } from './adapters.js';
export {
  planDispatch, getOrchestrator, resetOrchestrator,
  dispatchGoal, approveTask, rejectTask,
} from './dispatch.js';
export type { DispatchResult, DispatchPlanEntry, WorktreeInfo } from './dispatch.js';
export { useDispatchStore } from './dispatchStore.js';
export type { DispatchedTask } from './dispatchStore.js';
