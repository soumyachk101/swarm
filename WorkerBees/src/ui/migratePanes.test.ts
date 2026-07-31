import { describe, it, expect } from "vitest";
import { migratePanesState } from "./workerBeesStore.js";

/**
 * A pane whose `plane` still says "honeyflow" matches no plane at all, so it
 * disappears from every view while its pty keeps running. Silent and expensive.
 */
describe("pane migration (honeyflow renamed to honeyboard)", () => {
  const bee = (over: Record<string, unknown> = {}) =>
    ({ id: "p1", cli: "claude", cliName: "Claude Code", ...over }) as never;

  it("rewrites the stale plane", () => {
    const out = migratePanesState({ workerBees: [bee({ plane: "honeyflow" })] });
    expect(out.workerBees[0].plane).toBe("honeyboard");
  });

  it("rescues panes left on a plane that no longer has a tab", () => {
    // Browser and Emulator lost their title-bar tabs; a pane still stamped to
    // one is unreachable while its process keeps running.
    const out = migratePanesState({
      workerBees: [bee({ id: "a", plane: "browser" }), bee({ id: "b", plane: "emulator" })],
    });
    expect(out.workerBees.map((b) => b.plane)).toEqual(["honeyboard", "honeyboard"]);
  });

  it("leaves an unset plane alone", () => {
    const out = migratePanesState({ workerBees: [bee({ id: "b" })] });
    expect(out.workerBees[0].plane).toBeUndefined();
  });

  it("leaves a pane already on the board alone", () => {
    const out = migratePanesState({ workerBees: [bee({ plane: "honeyboard" })] });
    expect(out.workerBees[0].plane).toBe("honeyboard");
  });

  it("keeps every other field on the pane", () => {
    const out = migratePanesState({
      workerBees: [bee({ plane: "honeyflow", isQueen: true, workHiveId: "ws-1", model: "opus" })],
    });
    expect(out.workerBees[0]).toMatchObject({
      id: "p1", cli: "claude", isQueen: true, workHiveId: "ws-1", model: "opus",
    });
  });

  it("preserves the saved grid layout", () => {
    expect(migratePanesState({ workerBees: [], gridLayout: "grid2x2" }).gridLayout).toBe("grid2x2");
  });

  it("survives missing or empty state", () => {
    expect(migratePanesState(undefined).workerBees).toEqual([]);
    expect(migratePanesState({}).workerBees).toEqual([]);
  });
});
