// Agents' renderer surface: the CLI-agent pane, the plain shell pane, the
// pane store (including the Lead crown), and the boot-time wiring the pane
// needs (MCP config, agent trust, handoff sync). The app renders these and
// registers a host (see ./host) — no pane logic lives outside this package.
export { default as AgentPane } from './AgentPane.js';
export type { AgentInfo } from './AgentPane.js';
export { default as TerminalPane } from './TerminalPane.js';
export { default as ResizeHandle } from './ResizeHandle.js';
export { default as RoleBadge } from './RoleBadge.js';
export { default as CliUsagePanel } from './CliUsagePanel.js';
export type { CliUsage, UsageWindow } from './CliUsagePanel.js';
export { useAgentsStore } from './agentsStore.js';
export type { Agent, AgentStatus, GridLayout } from './agentsStore.js';
export { forgetSpawn, isAlreadySpawned, isTrackedAsSpawned, markSpawned } from './spawnGuard.js';
export { withHandoffLock } from './handoffQueue.js';
export { ensureMCPConfigForCLI, ensurePheromoneMcpForProject } from './ensureMcpConfig.js';
export type { PheromoneBridge } from './ensureMcpConfig.js';
export { ensureCliWorkspaceTrust } from './ensureWorkspaceTrust.js';
export { excerptForHandoff, looksLikeTerminalGarbage, stripTerminalNoise } from './sanitizeHandoff.js';
export { setAgentsHost } from './host.js';
export type { AgentsHost } from './host.js';
// Shared zustand storage that degrades to memory when there is no localStorage
// (tests). Lives here because it is the pane store's own dependency.
export { appStorage } from './persistStorage.js';
