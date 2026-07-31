// QueenBee's tools act on things only the app owns: workHives, panes, the
// browser view, and HiveMind's dispatch pipeline. The app registers those
// capabilities once at boot; QueenBee never imports app stores or HiveMind, so
// it stays standalone and the package graph stays acyclic.
//
// The shapes below are structural on purpose — describing what QueenBee needs,
// not re-importing the providers' own types.
import type { ComponentType } from 'react';
import type { ToolContext } from '../tools.js';
import type { QueenBeeMode } from '../modes.js';

export interface CrownedBee {
  id: string;
  cliName: string;
  customName?: string;
  queenMode?: QueenBeeMode;
}

export interface DispatchOutcome {
  taskId: string;
  title: string;
  cli: string;
  worktree?: { path: string; branch: string };
  blockedBy?: Array<{ filePath: string; existingOwner: string }>;
  error?: string;
}

export interface DispatchedEntry {
  taskId: string;
  title: string;
  cli: string;
  branch: string;
  worktreePath: string;
}

export interface QueenBeeHost {
  /** Which workhive works in this folder, if any. */
  workHiveIdForFolder(folder: string): string | undefined;
  /** The synchronous tool bindings for one workhive (see ToolContext). */
  toolContext(workHiveId: string): ToolContext;

  /** React hooks the app owns, so QueenBee's views track the shell reactively
   *  without importing its stores. */
  useActiveWorkspaceId(): string;
  useActiveFolder(): string | null;
  /** Every bound folder, joined and sorted, so the bridge re-subscribes only
   *  when that set really changes. */
  useBoundFolderKey(): string;

  /** The crowned bee of a workhive, as a hook (for views) and a plain read
   *  (for the bridge). Supplied by the app so QueenBee never imports the pane
   *  package — which already depends on QueenBee's mode vocabulary. */
  useQueen(workHiveId: string): CrownedBee | undefined;
  queenOf(workHiveId: string): CrownedBee | undefined;
  setQueenMode(beeId: string, mode: QueenBeeMode): void;
  /** Write the active charter to the queen's folder so its MCP server can
   *  serve it. Never typed into the agent's prompt. */
  publishRole(mode: QueenBeeMode): void;
  /** Renders the crowned bee's live CLI pane. */
  QueenPane: ComponentType<{ paneId: string; workingDir: string | null }>;
  /** Launch a WorkerBee in a workhive; returns its pane id. */
  launchBee(workHiveId: string, cli: string, name: string, args?: string[]): string;
  /** Drive the browser pane and report what it shows. */
  captureBrowser(url?: string): Promise<{ url: string } | null>;

  /** HiveMind's pipeline, injected so QueenBee doesn't depend on it. */
  dispatchGoal(goal: string, folder: string, workHiveId: string): Promise<DispatchOutcome[]>;
  approveTask(folder: string, taskId: string): Promise<{ merged: boolean; viaOrchestrator: boolean; branch: string }>;
  rejectTask(folder: string, taskId: string, notes: string): Promise<{ viaOrchestrator: boolean; branch: string }>;
  dispatchedIn(folder: string): DispatchedEntry[];

  /** Where this queen reigns: its workhive, folder, trees and panes. Fed into
   *  queen_role so the agent knows the exact boundary it must stay inside when
   *  several projects are open at once. */
  describeScope(folder: string): string;
}

let host: QueenBeeHost | null = null;

export function setQueenBeeHost(next: QueenBeeHost): void {
  host = next;
}

export function queenBeeHost(): QueenBeeHost {
  if (!host) throw new Error('QueenBee host not registered — the app must call setQueenBeeHost at boot.');
  return host;
}

export function hasQueenBeeHost(): boolean {
  return host !== null;
}
