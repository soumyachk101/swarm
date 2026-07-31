// Lead's renderer surface: the dock panel that hosts the crowned CLI, the
// role picker, the request bridge its MCP server talks to, and the tool runner
// behind it. The app registers a host (see ./host) and renders these — no
// Lead behaviour lives outside this package.
export { default as LeadPanel, LeadModeSelect } from './LeadPanel.js';
export { useLeadBridge } from './leadBridge.js';
export { runLeadTool } from './leadTools.js';
export { setLeadHost, hasLeadHost } from './host.js';
export type { LeadHost, CrownedSwarm, DispatchOutcome, DispatchedEntry } from './host.js';
