import { describe, it, expect } from "vitest";
import { migratePanesState } from "./agentsStore.js";

/**
 * A pane whose `plane` still says "honeyflow" matches no plane at all, so it
 * disappears from every view while its pty keeps running. Silent and expensive.
 */
describe("pane migration (honeyflow -> honeyboard -> board)", () => {
  const swarm = (over: Record<string, unknown> = {}) =>
    ({ id: "p1", cli: "claude", cliName: "Claude Code", ...over }) as never;

  it("rewrites a stale plane from either past name", () => {
    expect(migratePanesState({ agents: [swarm({ plane: "honeyflow" })] }).agents[0].plane).toBe("board");
    expect(migratePanesState({ agents: [swarm({ plane: "honeyboard" })] }).agents[0].plane).toBe("board");
  });

  it("rescues panes left on a plane that no longer has a tab", () => {
    // Browser and Emulator lost their title-bar tabs; a pane still stamped to
    // one is unreachable while its process keeps running.
    const out = migratePanesState({
      agents: [swarm({ id: "a", plane: "browser" }), swarm({ id: "b", plane: "emulator" })],
    });
    expect(out.agents.map((b) => b.plane)).toEqual(["board", "board"]);
  });

  it("leaves an unset plane alone", () => {
    const out = migratePanesState({ agents: [swarm({ id: "b" })] });
    expect(out.agents[0].plane).toBeUndefined();
  });

  it("leaves a pane already on the board alone", () => {
    const out = migratePanesState({ agents: [swarm({ plane: "board" })] });
    expect(out.agents[0].plane).toBe("board");
  });

  it("keeps every other field on the pane", () => {
    const out = migratePanesState({
      agents: [swarm({ plane: "honeyflow", isLead: true, workspaceId: "ws-1", model: "opus" })],
    });
    expect(out.agents[0]).toMatchObject({
      id: "p1", cli: "claude", isLead: true, workspaceId: "ws-1", model: "opus",
    });
  });

  it("preserves the saved grid layout", () => {
    expect(migratePanesState({ agents: [], gridLayout: "grid2x2" }).gridLayout).toBe("grid2x2");
  });

  it("survives missing or empty state", () => {
    expect(migratePanesState(undefined).agents).toEqual([]);
    expect(migratePanesState({}).agents).toEqual([]);
  });
});
