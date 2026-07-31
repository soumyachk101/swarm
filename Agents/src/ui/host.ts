// The pane layer needs a few facts that belong to the app shell, not to
// Agents: which provider keys to hand a CLI, which files the user has open,
// which agent a new pane belongs to, and how to reveal the Lead dock.
//
// The app registers them once at boot (see Swarm's host wiring). Agents
// never imports app stores, so it stays a standalone package.
import type { ApiKeys } from '../cli-configs/env.js';

export interface AgentsHost {
  /** Provider keys, turned into CLI env vars by envForCli. */
  apiKeys(): ApiKeys;
  /** Files the user has open in this folder — used for the memory hint. */
  openFilesFor(folder: string | null | undefined): string[];
  /** Workspace a newly-added pane belongs to when the caller doesn't say. */
  activeWorkspaceId(): string;
  /** Show the dock where a crowned pane renders. */
  revealLeadDock(): void;
  /** Publish the crowned agent's charter where its MCP server can serve it.
   *  Never typed into the CLI — see AgentPane. */
  publishLeadRole(folder: string | null | undefined, mode: string): void;
}

const EMPTY_KEYS: ApiKeys = {
  anthropic: '', openai: '', google: '', openrouter: '', moonshot: '',
};

let host: AgentsHost = {
  apiKeys: () => EMPTY_KEYS,
  openFilesFor: () => [],
  activeWorkspaceId: () => '',
  revealLeadDock: () => {},
  publishLeadRole: () => {},
};

export function setAgentsHost(next: AgentsHost): void {
  host = next;
}

export function agentsHost(): AgentsHost {
  return host;
}
