import { describe, it, expect, vi } from "vitest";
import { executeTool, toolsForMode, ToolError, ASYNC_TOOLS, type ToolContext } from "./tools.js";

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    createWorkspace: vi.fn(() => "ws-1"),
    listWorkspaces: vi.fn(() => [{ id: "ws-1", name: "Default" }]),
    addTask: vi.fn(),
    listTasks: vi.fn(() => [{ id: "t-1", title: "A", column: "todo" }]),
    moveTask: vi.fn(() => true),
    launchAgent: vi.fn(),
    listWorktrees: vi.fn(() => [{ id: "tree-1", name: "styling", branch: "agent/styling", path: "/repo/.worktrees/styling" }]),
    launchTerminal: vi.fn(),
    setBoardOpen: vi.fn(),
    openSettings: vi.fn(() => true),
    deleteWorkspace: vi.fn(() => true),
    renameWorkspace: vi.fn(() => true),
    recolorWorkspace: vi.fn(() => true),
    switchWorkspace: vi.fn(() => true),
    listAgents: vi.fn(() => [{ id: "swarm-1", name: "claude", cli: "claude" }]),
    removeAgent: vi.fn(() => true),
    renameAgent: vi.fn(() => true),
    reorderAgent: vi.fn(() => true),
    setDefaultAgent: vi.fn(),
    setGridLayout: vi.fn(),
    maximizePane: vi.fn(),
    refitTerminals: vi.fn(),
    setLeftSidebar: vi.fn(),
    setRightDock: vi.fn(),
    ...over,
  };
}

describe("leadTools mode gating", () => {
  it("Steward gets mutating tools; Forager/Stinger do not", () => {
    expect(toolsForMode("Steward").some((t) => t.mutates)).toBe(true);
    expect(toolsForMode("Forager").every((t) => !t.mutates)).toBe(true);
    expect(toolsForMode("Stinger").every((t) => !t.mutates)).toBe(true);
  });

  it("read-only mode cannot call a mutating tool", () => {
    expect(() => executeTool("Forager", "add_task", { title: "x" }, ctx())).toThrow(ToolError);
  });
});

describe("executeTool", () => {
  it("creates a agent", () => {
    const c = ctx();
    expect(executeTool("Steward", "create_agent", { name: "New" }, c)).toContain("New");
    expect(c.createWorkspace).toHaveBeenCalledWith("New");
  });

  it("rejects missing required args", () => {
    expect(() => executeTool("Steward", "add_task", {}, ctx())).toThrow(/Missing required/);
  });

  it("rejects an invalid column", () => {
    expect(() => executeTool("Steward", "move_task", { taskId: "t-1", column: "nope" }, ctx())).toThrow(/Invalid column/);
  });

  it("surfaces a missing task on move", () => {
    expect(() => executeTool("Steward", "move_task", { taskId: "zzz", column: "done" }, ctx({ moveTask: () => false }))).toThrow(/No task found/);
  });

  it("Forager may read the board", () => {
    expect(executeTool("Forager", "list_tasks", {}, ctx())).toContain("A");
  });

  it("launches a plain terminal", () => {
    const c = ctx();
    expect(executeTool("Steward", "launch_terminal", { name: "build" }, c)).toContain("terminal");
    expect(c.launchTerminal).toHaveBeenCalledWith("build");
  });

  it("opens settings", () => {
    const c = ctx();
    expect(executeTool("Steward", "open_settings", {}, c)).toContain("Opened");
    expect(c.openSettings).toHaveBeenCalled();
  });

  it("reports when settings cannot be opened", () => {
    expect(executeTool("Steward", "open_settings", {}, ctx({ openSettings: () => false }))).toContain("can't");
  });

  it("refuses async tools — the host must run them", () => {
    // Args must satisfy every async tool's `required` list, otherwise the
    // missing-arg check fires before the async guard we're asserting on.
    const args = { goal: "x", path: "p", query: "q", taskId: "t-1", content: "c" };
    for (const name of ASYNC_TOOLS) {
      expect(() => executeTool("Steward", name, args, ctx())).toThrow(/must be executed by the host/);
    }
  });

  it("performs agent + agent management", () => {
    const c = ctx();
    expect(executeTool("Steward", "rename_agent", { id: "ws-1", name: "X" }, c)).toContain("Renamed");
    expect(executeTool("Steward", "switch_agent", { id: "ws-1" }, c)).toContain("Switched");
    expect(executeTool("Steward", "remove_worker_swarm", { id: "swarm-1" }, c)).toContain("Removed");
    expect(executeTool("Steward", "set_grid_layout", { layout: "2" }, c)).toContain("2");
    expect(executeTool("Steward", "set_left_sidebar", { open: false }, c)).toContain("Hid");
  });

  it("rejects a bad grid layout and out-of-range reorder", () => {
    expect(() => executeTool("Steward", "set_grid_layout", { layout: "9" }, ctx())).toThrow(/Invalid layout/);
    expect(() => executeTool("Steward", "reorder_worker_swarm", { from: 0, to: 99 }, ctx({ reorderAgent: () => false }))).toThrow(/out of range/);
  });

  it("surfaces missing entities", () => {
    expect(() => executeTool("Steward", "delete_agent", { id: "zzz" }, ctx({ deleteWorkspace: () => false }))).toThrow(/No agent/);
    expect(() => executeTool("Steward", "remove_worker_swarm", { id: "zzz" }, ctx({ removeAgent: () => false }))).toThrow(/No Agent/);
  });

  it("management tools are Steward-only", () => {
    for (const name of ["delete_agent", "set_grid_layout", "set_left_sidebar", "remove_worker_swarm"]) {
      expect(toolsForMode("Forager").map((t) => t.name)).not.toContain(name);
    }
  });
});

describe("read-only memory tools", () => {
  it("are available to every mode (auditors must read memory)", () => {
    for (const mode of ["Steward", "Forager", "Stinger"] as const) {
      const names = toolsForMode(mode).map((t) => t.name);
      expect(names).toContain("search_memory");
      expect(names).toContain("read_memory_file");
      expect(names).toContain("list_memory_files");
    }
  });

  it("dispatch_goal stays Steward-only", () => {
    expect(toolsForMode("Forager").map((t) => t.name)).not.toContain("dispatch_goal");
    expect(toolsForMode("Steward").map((t) => t.name)).toContain("dispatch_goal");
  });
});

describe("capture_browser_screenshot", () => {
  it("is available to every mode (observation, not mutation)", () => {
    for (const mode of ["Steward", "Forager", "Stinger"] as const) {
      expect(toolsForMode(mode).map((t) => t.name)).toContain("capture_browser_screenshot");
    }
  });

  it("needs no arguments (url is optional)", () => {
    const def = toolsForMode("Steward").find((t) => t.name === "capture_browser_screenshot")!;
    expect(def.required).toEqual([]);
  });

  it("is host-executed — executeTool must refuse it rather than run it", () => {
    expect(() =>
      executeTool("Steward", "capture_browser_screenshot", {}, ctx()),
    ).toThrow(ToolError);
  });
});

describe("a lead sees its own project's worktrees", () => {
  it("lists them with branch and path", () => {
    const out = executeTool("Steward", "list_worktrees", {}, ctx());
    expect(out).toContain("styling");
    expect(out).toContain("agent/styling");
  });

  it("is read-only, so auditors can call it too", () => {
    expect(executeTool("Forager", "list_worktrees", {}, ctx())).toContain("styling");
    expect(executeTool("Stinger", "list_worktrees", {}, ctx())).toContain("styling");
  });

  it("says so plainly when the project has none", () => {
    const out = executeTool("Steward", "list_worktrees", {}, ctx({ listWorktrees: () => [] }));
    expect(out).toMatch(/No worktrees/);
  });
});

describe("summoning swarms with a model and effort", () => {
  it("passes the model and effort through to the host", () => {
    const launch = vi.fn();
    executeTool("Steward", "launch_worker_swarm", { cli: "claude", model: "opus", effort: "medium" }, ctx({ launchAgent: launch }));
    expect(launch).toHaveBeenCalledWith("claude", undefined, { model: "opus", effort: "medium" });
  });

  it("reports back what it summoned", () => {
    const out = executeTool("Steward", "launch_worker_swarm", { cli: "claude", name: "Builder", model: "opus", effort: "medium" }, ctx());
    expect(out).toContain("Builder");
    expect(out).toContain("opus");
    expect(out).toContain("medium effort");
  });

  it("still works with no model or effort at all", () => {
    const launch = vi.fn();
    const out = executeTool("Steward", "launch_worker_swarm", { cli: "codex" }, ctx({ launchAgent: launch }));
    expect(launch).toHaveBeenCalledWith("codex", undefined, { model: undefined, effort: undefined });
    expect(out).not.toContain("[");
  });

  it("rejects an effort level outside the allowed set", () => {
    expect(() =>
      executeTool("Steward", "launch_worker_swarm", { cli: "claude", effort: "ludicrous" }, ctx()),
    ).toThrow(ToolError);
  });

  it("stays closed to read-only modes", () => {
    expect(() => executeTool("Forager", "launch_worker_swarm", { cli: "claude" }, ctx())).toThrow(ToolError);
  });
});
