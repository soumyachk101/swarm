// The pane layer needs a few facts that belong to the app shell, not to
// WorkerBees: which provider keys to hand a CLI, which files the user has open,
// which workhive a new pane belongs to, and how to reveal the QueenBee dock.
//
// The app registers them once at boot (see Hive's host wiring). WorkerBees
// never imports app stores, so it stays a standalone package.
import type { ApiKeys } from '../cli-configs/env.js';

export interface WorkerBeesHost {
  /** Provider keys, turned into CLI env vars by envForCli. */
  apiKeys(): ApiKeys;
  /** Files the user has open in this folder — used for the memory hint. */
  openFilesFor(folder: string | null | undefined): string[];
  /** WorkHive a newly-added pane belongs to when the caller doesn't say. */
  activeWorkHiveId(): string;
  /** Show the dock where a crowned pane renders. */
  revealQueenDock(): void;
  /** Publish the crowned agent's charter where its MCP server can serve it.
   *  Never typed into the CLI — see WorkerBeePane. */
  publishQueenRole(folder: string | null | undefined, mode: string): void;
}

const EMPTY_KEYS: ApiKeys = {
  anthropic: '', openai: '', google: '', openrouter: '', moonshot: '',
};

let host: WorkerBeesHost = {
  apiKeys: () => EMPTY_KEYS,
  openFilesFor: () => [],
  activeWorkHiveId: () => '',
  revealQueenDock: () => {},
  publishQueenRole: () => {},
};

export function setWorkerBeesHost(next: WorkerBeesHost): void {
  host = next;
}

export function workerBeesHost(): WorkerBeesHost {
  return host;
}
