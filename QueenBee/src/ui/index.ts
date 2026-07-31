// QueenBee's renderer surface: the dock panel that hosts the crowned CLI, the
// role picker, the request bridge its MCP server talks to, and the tool runner
// behind it. The app registers a host (see ./host) and renders these — no
// QueenBee behaviour lives outside this package.
export { default as QueenBeePanel, QueenModeSelect } from './QueenBeePanel.js';
export { useQueenBridge } from './queenBridge.js';
export { runQueenTool } from './queenTools.js';
export { setQueenBeeHost, hasQueenBeeHost } from './host.js';
export type { QueenBeeHost, CrownedBee, DispatchOutcome, DispatchedEntry } from './host.js';
