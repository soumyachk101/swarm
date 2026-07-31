// The workspace surface: the rail of workspaces and their trees, the create
// dialog, the per-pane tree selector and the toolbox pane.
//
// WorkspacesPanel, WorkspaceTabStrip and WorkspaceTrees were exported here too.
// Nothing in the app imported any of them — the rail replaced all three — and
// they carried the second density language (big padded cards) that made this
// package look inconsistent with the rest of the UI.
export { default as WorkspacesSidebar } from './WorkspacesSidebar.js';
export { default as WorkspaceCreateDialog } from './WorkspaceCreateDialog.js';
export { default as WorktreeSelect } from './WorktreeSelect.js';
export { default as ToolboxPane } from './ToolboxPane.js';
