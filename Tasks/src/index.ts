export { Board, COLUMNS, DEFAULT_COLUMNS } from './board.js';
// Pure card semantics — shared by Board and by immutable hosts (see cards.ts).
export {
  createCard, newCardId, addCard, moveCard, removeCard, updateCard, cardsByColumn,
} from './cards.js';
export type { NewCardInput } from './cards.js';
export { DefaultDispatchResolver, buildDispatchCommand } from './dispatch.js';
export type { TaskCard, ColumnId, ColumnDefinition } from './board.js';
export type { DispatchCommand, DispatchResolver } from './dispatch.js';

// Pipeline types + builder
export { buildPipeline, nodeStatus } from './pipeline.js';
export type { PipelineNode, PipelineStage, NodeStatus } from './pipeline.js';

// React kanban UI components (re-exported from components/ namespace)
export { default as TasksDrawer } from './components/TasksDrawer.js';
export { default as TasksLaneGrid } from './components/TasksLaneGrid.js';
export { default as TasksStatusLane } from './components/TasksStatusLane.js';
export { default as TasksCard } from './components/TasksCard.js';
export { default as TasksDrawerHeader } from './components/TasksDrawerHeader.js';
export { useTasksBoardPanel } from './components/useTasksBoardPanel.js';
export { useTasksCardPointerDrag } from './components/use-tasks-card-pointer-drag.js';
export { useTasksSelection } from './components/use-tasks-selection.js';
export { useTasksColumnResize } from './components/use-tasks-column-resize.js';
export { groupTasksByColumn } from './components/tasks-worktree-groups.js';

// Pipeline board
export { default as PipelineBoard } from './components/PipelineBoard.js';
export { default as ProgressBoard } from './components/ProgressBoard.js';
export { default as TaskListBoard } from './components/TaskListBoard.js';
export { default as TasksPanel } from './components/TasksPanel.js';
