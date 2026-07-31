// Lead's tools act on things only the app owns: workspaces, panes, the
// browser view, and SwarmMind's dispatch pipeline. The app registers those
// capabilities once at boot; Lead never imports app stores or SwarmMind, so
// it stays standalone and the package graph stays acyclic.
//
// The shapes below are structural on purpose — describing what Lead needs,
// not re-importing the providers' own types.
import type { ComponentType } from 'react';
import type { ToolContext } from '../tools.js';
import type { LeadMode } from '../modes.js';

export interface CrownedSwarm {
  id: string;
  cliName: string;
  customName?: string;
  leadMode?: LeadMode;
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

export interface LeadHost {
  /** Which agent works in this folder, if any. */
  workspaceIdForFolder(folder: string): string | undefined;
  /** The synchronous tool bindings for one agent (see ToolContext). */
  toolContext(workspaceId: string): ToolContext;

  /** React hooks the app owns, so Lead's views track the shell reactively
   *  without importing its stores. */
  useActiveWorkspaceId(): string;
  useActiveFolder(): string | null;
  /** Every bound folder, joined and sorted, so the bridge re-subscribes only
   *  when that set really changes. */
  useBoundFolderKey(): string;

  /** The crowned swarm of a agent, as a hook (for views) and a plain read
   *  (for the bridge). Supplied by the app so Lead never imports the pane
   *  package — which already depends on Lead's mode vocabulary. */
  useLead(workspaceId: string): CrownedSwarm | undefined;
  leadOf(workspaceId: string): CrownedSwarm | undefined;
  setLeadMode(swarmId: string, mode: LeadMode): void;
  /** Write the active charter to the lead's folder so its MCP server can
   *  serve it. Never typed into the agent's prompt. */
  publishRole(mode: LeadMode): void;
  /** Renders the crowned swarm's live CLI pane. */
  LeadPane: ComponentType<{ paneId: string; workingDir: string | null }>;
  /** Launch a Agent in a agent; returns its pane id. */
  launchSwarm(workspaceId: string, cli: string, name: string, args?: string[]): string;
  /** Drive the browser pane and report what it shows. */
  captureBrowser(url?: string): Promise<{ url: string } | null>;

  /** SwarmMind's pipeline, injected so Lead doesn't depend on it. */
  dispatchGoal(goal: string, folder: string, workspaceId: string): Promise<DispatchOutcome[]>;
  approveTask(folder: string, taskId: string): Promise<{ merged: boolean; viaOrchestrator: boolean; branch: string }>;
  rejectTask(folder: string, taskId: string, notes: string): Promise<{ viaOrchestrator: boolean; branch: string }>;
  dispatchedIn(folder: string): DispatchedEntry[];

  /** Where this lead reigns: its agent, folder, trees and panes. Fed into
   *  lead_role so the agent knows the exact boundary it must stay inside when
   *  several projects are open at once. */
  describeScope(folder: string): string;
}

let host: LeadHost | null = null;

export function setLeadHost(next: LeadHost): void {
  host = next;
}

export function leadHost(): LeadHost {
  if (!host) throw new Error('Lead host not registered — the app must call setLeadHost at boot.');
  return host;
}

export function hasLeadHost(): boolean {
  return host !== null;
}
