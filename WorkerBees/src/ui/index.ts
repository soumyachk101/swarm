// WorkerBees' renderer surface: the CLI-agent pane, the plain shell pane, the
// pane store (including the QueenBee crown), and the boot-time wiring the pane
// needs (MCP config, workhive trust, handoff sync). The app renders these and
// registers a host (see ./host) — no pane logic lives outside this package.
export { default as WorkerBeePane } from './WorkerBeePane.js';
export type { WorkerBeeInfo } from './WorkerBeePane.js';
export { default as TerminalPane } from './TerminalPane.js';
export { default as ResizeHandle } from './ResizeHandle.js';
export { default as RoleBadge } from './RoleBadge.js';
export { default as CliUsagePanel } from './CliUsagePanel.js';
export type { CliUsage, UsageWindow } from './CliUsagePanel.js';
export { useWorkerBeesStore } from './workerBeesStore.js';
export type { WorkerBee, AgentStatus, GridLayout } from './workerBeesStore.js';
export { forgetSpawn, isAlreadySpawned, isTrackedAsSpawned, markSpawned } from './spawnGuard.js';
export { withHandoffLock } from './handoffQueue.js';
export { ensureMCPConfigForCLI, ensureNectarMcpForProject } from './ensureMcpConfig.js';
export type { NectarBridge } from './ensureMcpConfig.js';
export { ensureCliWorkspaceTrust } from './ensureWorkspaceTrust.js';
export { excerptForHandoff, looksLikeTerminalGarbage, stripTerminalNoise } from './sanitizeHandoff.js';
export { setWorkerBeesHost } from './host.js';
export type { WorkerBeesHost } from './host.js';
// Shared zustand storage that degrades to memory when there is no localStorage
// (tests). Lives here because it is the pane store's own dependency.
export { appStorage } from './persistStorage.js';
