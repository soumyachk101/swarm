import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The guard answers one question: may this pane reattach to a running process,
// or does it need a fresh one? Reattach keeps a session alive across agent
// switches; a fresh spawn is required when the pane is pointed at a different
// worktree, because a process cannot be moved between directories.
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

const load = async () => {
  vi.resetModules();
  return import("./spawnGuard.js");
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) =>
    cmd === "is_process_alive" ? Promise.resolve(true) : Promise.resolve(undefined),
  );
});

afterEach(() => vi.restoreAllMocks());

describe("spawnGuard", () => {
  it("reattaches when the pane comes back in the same directory", async () => {
    const g = await load();
    g.markSpawned("p1", "C:/repo");
    expect(await g.isAlreadySpawned("p1", "C:/repo")).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith("kill_terminal", expect.anything());
  });

  it("kills and respawns when the pane is pointed at another worktree", async () => {
    const g = await load();
    g.markSpawned("p1", "C:/repo");
    // The user picked a tree: same pane, different checkout.
    expect(await g.isAlreadySpawned("p1", "C:/repo/.worktrees/fdf")).toBe(false);
    expect(invoke).toHaveBeenCalledWith("kill_terminal", { paneId: "p1" });
  });

  it("drops the old transcript with the old directory", async () => {
    const g = await load();
    g.markSpawned("p1", "C:/repo");
    g.saveTranscript("p1", "output from the main checkout");
    await g.isAlreadySpawned("p1", "C:/repo/.worktrees/fdf");
    expect(g.takeTranscript("p1")).toBe("");
  });

  it("keeps the transcript across a plain remount", async () => {
    const g = await load();
    g.markSpawned("p1", "C:/repo");
    g.saveTranscript("p1", "still mine");
    await g.isAlreadySpawned("p1", "C:/repo");
    expect(g.takeTranscript("p1")).toBe("still mine");
  });

  it("respawns when the process died while unmounted", async () => {
    const g = await load();
    g.markSpawned("p1", "C:/repo");
    invoke.mockImplementation((cmd: string) =>
      cmd === "is_process_alive" ? Promise.resolve(false) : Promise.resolve(undefined),
    );
    expect(await g.isAlreadySpawned("p1", "C:/repo")).toBe(false);
  });

  it("treats an unknown pane as never spawned", async () => {
    const g = await load();
    expect(await g.isAlreadySpawned("nope", "C:/repo")).toBe(false);
  });
});
