import { invoke } from "@tauri-apps/api/core";

// A pane can unmount without its process dying: switching workspaces, or
// crowning a swarm (which moves it from the grid to the dock). Re-calling
// spawn_terminal on remount would kill the running agent and start a fresh one,
// losing the session. This tracks which pane ids already own a live pty.
//
// The Rust side keeps buffering output while nothing is reading, so the first
// read_from_terminal after a remount replays everything missed; the transcript
// kept here restores what the old xterm had on screen before it.
//
// The directory is part of the identity: a process cannot be moved between
// working directories, so a pane pointed at a different worktree needs a fresh
// one rather than a reattach.
const spawned = new Map<string, string>();
const transcripts = new Map<string, string>();

// How much scrollback to hand a remounted pane. Enough to see the current
// conversation, small enough not to hold a session's whole output in memory.
const MAX_REPLAY = 60_000;

const dirKey = (dir?: string | null) => dir ?? "";

/**
 * True when this pane's process is already running IN THE SAME DIRECTORY, and
 * so must not be respawned. When the directory changed — the user picked a
 * different tree — the old process is killed here so the caller starts a new
 * one where they asked for.
 */
export async function isAlreadySpawned(paneId: string, dir?: string | null): Promise<boolean> {
  if (!spawned.has(paneId)) return false;

  if (spawned.get(paneId) !== dirKey(dir)) {
    // A running shell/agent cannot be relocated, so honour the new tree by
    // replacing it. Its transcript goes too: it belongs to the old checkout.
    await invoke("kill_terminal", { paneId }).catch(() => {});
    forgetSpawn(paneId);
    return false;
  }

  try {
    if (await invoke<boolean>("is_process_alive", { paneId })) return true;
  } catch {
    // treat an unanswerable check as dead — better a respawn than a blank pane
  }
  forgetSpawn(paneId);
  return false;
}

export function markSpawned(paneId: string, dir?: string | null): void {
  spawned.set(paneId, dirKey(dir));
}

/**
 * Synchronous check for "is this pane still tracked as having a live pty" —
 * true across a hide/remount (workspace switch, crowning), false once
 * `forgetSpawn` has run (a real close). Lets an unmount handler tell a real
 * close apart from a remount without an async IPC round-trip.
 */
export function isTrackedAsSpawned(paneId: string): boolean {
  return spawned.has(paneId);
}

/** Called when the pane is closed for real (the pty is killed with it). */
export function forgetSpawn(paneId: string): void {
  spawned.delete(paneId);
  transcripts.delete(paneId);
}

export function saveTranscript(paneId: string, text: string): void {
  if (!spawned.has(paneId)) return;
  transcripts.set(paneId, text.slice(-MAX_REPLAY));
}

export function takeTranscript(paneId: string): string {
  return transcripts.get(paneId) ?? "";
}
