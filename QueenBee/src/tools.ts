import type { QueenBeeMode } from "./modes.js";

// QueenBee's tool-calling surface: the actions she can perform conversationally,
// mapping 1:1 to things the UI can do. Pure + side-effect-free here — execution
// is injected via ToolContext so this module is testable without React/stores.
//
// Mode gating (per MODES.md): Steward acts (create/dispatch); Forager & Stinger
// are read-only auditors — they observe and report, they never mutate.

export interface ToolParam {
  type: "string" | "number" | "boolean";
  description: string;
  enum?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  params: Record<string, ToolParam>;
  required: string[];
  /** Whether the tool mutates app state (gated to Steward). */
  mutates: boolean;
}

/** Callbacks the host wires to real stores/Tauri. Kept minimal + typed. */
export interface ToolContext {
  createWorkHive: (name: string) => string;
  listWorkHives: () => Array<{ id: string; name: string }>;
  addTask: (title: string, description?: string) => void;
  listTasks: () => Array<{ id: string; title: string; column: string }>;
  moveTask: (taskId: string, column: string) => boolean;
  /** Launch a CLI agent, optionally pinned to a model and effort level. */
  launchWorkerBee: (
    cli: string,
    name?: string,
    opts?: { model?: string; effort?: string },
  ) => void;
  launchTerminal: (name?: string) => void;
  setBoardOpen: (open: boolean) => void;
  openSettings: () => boolean;
  // workHives
  deleteWorkHive: (id: string) => boolean;
  renameWorkHive: (id: string, name: string) => boolean;
  recolorWorkHive: (id: string, color: string) => boolean;
  switchWorkHive: (id: string) => boolean;
  // worker bees
  listWorkerBees: () => Array<{ id: string; name: string; cli: string; model?: string; effort?: string }>;
  /** Git worktrees ("trees") under this workhive's repo. */
  listWorktrees: () => Array<{ id: string; name: string; branch: string; path: string }>;
  removeWorkerBee: (id: string) => boolean;
  renameWorkerBee: (id: string, name: string) => boolean;
  reorderWorkerBee: (from: number, to: number) => boolean;
  setDefaultWorkerBee: (cli: string) => void;
  // layout
  setGridLayout: (layout: string) => void;
  maximizePane: (id: string | null) => void;
  refitTerminals: () => void;
  // chrome
  setLeftSidebar: (open: boolean) => void;
  setRightDock: (open: boolean) => void;
}

const COLUMNS = ["backlog", "todo", "in-progress", "review", "done"];

export const TOOLS: ToolDef[] = [
  {
    name: "create_workhive",
    description: "Create a new workhive (a saved project context / tab).",
    params: { name: { type: "string", description: "WorkHive name" } },
    required: ["name"],
    mutates: true,
  },
  {
    name: "list_worktrees",
    description:
      "List this project's git worktrees (\"trees\"): the isolated checkouts agents work in, with their branches and paths. Your dispatches land in these.",
    params: {},
    required: [],
    mutates: false,
  },
  {
    name: "list_workhives",
    description: "List all workhives with their ids and names.",
    params: {},
    required: [],
    mutates: false,
  },
  {
    name: "add_task",
    description: "Add a task card to the active workhive board (lands in Backlog).",
    params: {
      title: { type: "string", description: "Short task title" },
      description: { type: "string", description: "Optional longer description" },
    },
    required: ["title"],
    mutates: true,
  },
  {
    name: "list_tasks",
    description: "List task cards on the active workhive board.",
    params: {},
    required: [],
    mutates: false,
  },
  {
    name: "move_task",
    description: "Move a task card to a different board column.",
    params: {
      taskId: { type: "string", description: "Task card id" },
      column: { type: "string", description: "Target column", enum: COLUMNS },
    },
    required: ["taskId", "column"],
    mutates: true,
  },
  {
    name: "launch_worker_bee",
    description:
      "Summon a WorkerBee: a CLI coding agent in its own pane. Optionally pin which model it runs and how hard it thinks — e.g. Claude Code on opus at medium effort. Launch as many as the work needs.",
    params: {
      cli: { type: "string", description: "CLI command to run, e.g. 'claude', 'codex', 'aider', 'opencode', 'agy'" },
      name: { type: "string", description: "Optional display name for the pane" },
      model: {
        type: "string",
        description:
          "Model for this bee. Claude Code takes an alias ('opus', 'sonnet', 'fable') or a full name; Codex takes a model id; OpenCode wants 'provider/model'. Omit to use the CLI's default.",
      },
      effort: {
        type: "string",
        description:
          "How hard the model should think. Claude Code supports all five; Codex clamps xhigh/max to high; other CLIs ignore it.",
        enum: ["low", "medium", "high", "xhigh", "max"],
      },
    },
    required: ["cli"],
    mutates: true,
  },
  {
    name: "launch_terminal",
    description: "Open a plain shell terminal pane (PowerShell/cmd/bash) for running arbitrary commands — not a CLI agent.",
    params: { name: { type: "string", description: "Optional display name" } },
    required: [],
    mutates: true,
  },
  {
    name: "set_board",
    description: "Open or close the TaskComb board drawer.",
    params: { open: { type: "boolean", description: "true to open, false to close" } },
    required: ["open"],
    mutates: true,
  },
  {
    name: "open_settings",
    description: "Open the Settings panel (providers + models configuration).",
    params: {},
    required: [],
    mutates: true,
  },
  {
    name: "delete_workhive",
    description: "Delete a workhive by id.",
    params: { id: { type: "string", description: "WorkHive id" } },
    required: ["id"],
    mutates: true,
  },
  {
    name: "rename_workhive",
    description: "Rename a workhive.",
    params: { id: { type: "string", description: "WorkHive id" }, name: { type: "string", description: "New name" } },
    required: ["id", "name"],
    mutates: true,
  },
  {
    name: "recolor_workhive",
    description: "Change a workhive's accent color (hex, e.g. #22c55e).",
    params: { id: { type: "string", description: "WorkHive id" }, color: { type: "string", description: "Hex color" } },
    required: ["id", "color"],
    mutates: true,
  },
  {
    name: "switch_workhive",
    description: "Make a workhive the active one.",
    params: { id: { type: "string", description: "WorkHive id" } },
    required: ["id"],
    mutates: true,
  },
  {
    name: "list_worker_bees",
    description: "List running WorkerBees with their ids, names, and CLI.",
    params: {},
    required: [],
    mutates: false,
  },
  {
    name: "remove_worker_bee",
    description: "Close/remove a WorkerBee pane by id.",
    params: { id: { type: "string", description: "WorkerBee id" } },
    required: ["id"],
    mutates: true,
  },
  {
    name: "rename_worker_bee",
    description: "Rename a WorkerBee pane.",
    params: { id: { type: "string", description: "WorkerBee id" }, name: { type: "string", description: "New display name" } },
    required: ["id", "name"],
    mutates: true,
  },
  {
    name: "reorder_worker_bee",
    description: "Move a WorkerBee from one grid position to another (0-based indices).",
    params: { from: { type: "number", description: "Current index" }, to: { type: "number", description: "Target index" } },
    required: ["from", "to"],
    mutates: true,
  },
  {
    name: "set_default_worker_bee",
    description: "Set the default CLI used when launching a new WorkerBee.",
    params: { cli: { type: "string", description: "CLI command, e.g. 'claude'" } },
    required: ["cli"],
    mutates: true,
  },
  {
    name: "set_grid_layout",
    description: "Set the WorkerBee grid layout.",
    params: { layout: { type: "string", description: "'auto', '1', '2', '3', or '4'", enum: ["auto", "1", "2", "3", "4"] } },
    required: ["layout"],
    mutates: true,
  },
  {
    name: "maximize_pane",
    description: "Maximize a WorkerBee pane by id, or pass an empty id to restore the grid.",
    params: { id: { type: "string", description: "Pane id, or '' to restore" } },
    required: [],
    mutates: true,
  },
  {
    name: "refit_terminals",
    description: "Re-fit all terminal panes to their containers (after a layout change).",
    params: {},
    required: [],
    mutates: true,
  },
  {
    name: "set_left_sidebar",
    description: "Show or hide the left workhive sidebar.",
    params: { open: { type: "boolean", description: "true to show" } },
    required: ["open"],
    mutates: true,
  },
  {
    name: "set_right_dock",
    description: "Show or hide the right QueenBee dock.",
    params: { open: { type: "boolean", description: "true to show" } },
    required: ["open"],
    mutates: true,
  },
  {
    name: "list_memory_files",
    description: "List the project's Nectar memory files (.nectar/memory/*.md).",
    params: {},
    required: [],
    mutates: false,
  },
  {
    name: "read_memory_file",
    description: "Read one Nectar memory file's contents by its path relative to .nectar/memory/.",
    params: { path: { type: "string", description: "e.g. 'architecture.md'" } },
    required: ["path"],
    mutates: false,
  },
  {
    name: "search_memory",
    description: "Hybrid (vector + keyword) search over the project's Nectar memory.",
    params: { query: { type: "string", description: "What to look for" } },
    required: ["query"],
    mutates: false,
  },
  {
    name: "list_dispatched",
    description: "List tasks that were dispatched into isolated git worktrees and are awaiting approval.",
    params: {},
    required: [],
    mutates: false,
  },
  {
    name: "approve_task",
    description:
      "Approve a dispatched task: merge its agent branch back into the project and remove its worktree. Only call after the human has approved the merge.",
    params: { taskId: { type: "string", description: "Task id from list_dispatched" } },
    required: ["taskId"],
    mutates: true,
  },
  {
    name: "reject_task",
    description:
      "Reject a dispatched task and hand its worktree back to the WorkerBee for rework. The branch and file locks are kept so the agent can revise in place. Only call after the human has decided the work needs changes.",
    params: {
      taskId: { type: "string", description: "Task id from list_dispatched" },
      notes: { type: "string", description: "Reviewer notes: what to fix before re-review" },
    },
    required: ["taskId"],
    mutates: true,
  },
  {
    name: "run_stinger_scan",
    description:
      "Trigger a Stinger security / code-review scan of the project (or a specific path) and report findings. Read-only: it inspects code and surfaces issues, it never modifies anything.",
    params: {
      path: { type: "string", description: "Optional path to scan; defaults to the whole project." },
    },
    required: [],
    mutates: false,
  },
  {
    name: "write_memory",
    description:
      "Write a Nectar memory file (.nectar/memory/*.md). Nectar is QueenBee's memory — use this to record architecture, conventions, and decisions so every agent shares them. Overwrites the file at the given path.",
    params: {
      path: { type: "string", description: "Path under .nectar/memory/, e.g. 'architecture.md'" },
      content: { type: "string", description: "Full markdown content to write" },
    },
    required: ["path", "content"],
    mutates: true,
  },
  {
    name: "open_project",
    description: "Open the native folder picker so the human can choose a project to open.",
    params: {},
    required: [],
    mutates: true,
  },
  {
    name: "open_url",
    description: "Open a URL in the system browser — e.g. a running local dev server. Defaults to http://localhost:3000.",
    params: { url: { type: "string", description: "URL to open; defaults to http://localhost:3000" } },
    required: [],
    mutates: true,
  },
  {
    name: "dispatch_goal",
    description:
      "Break a goal into tasks and dispatch WorkerBees for each — creates an isolated git worktree per builder task, launches the agent, and adds a board card. Only call after the human has approved dispatching.",
    params: { goal: { type: "string", description: "The goal to break down and dispatch" } },
    required: ["goal"],
    mutates: true,
  },
  {
    name: "capture_browser_screenshot",
    description:
      "Capture a PNG screenshot of the open browser pane and look at it. Use this to " +
      "visually verify a running app (e.g. a localhost dev server) — check that a page " +
      "rendered, a layout is correct, or an error is visible. Optionally navigate to a " +
      "URL first. Requires a browser pane to be open.",
    params: {
      url: {
        type: "string",
        description: "Optional URL to navigate to before capturing (e.g. http://localhost:3000).",
      },
    },
    required: [],
    // Observation only — no app state changes, so every mode may look.
    mutates: false,
  },
];

/**
 * Tools the host executes asynchronously (Tauri IPC / git) rather than through
 * the pure executeTool switch below.
 */
export const ASYNC_TOOLS = new Set([
  "capture_browser_screenshot",
  "dispatch_goal",
  "approve_task",
  "reject_task",
  "run_stinger_scan",
  "list_dispatched",
  "list_memory_files",
  "read_memory_file",
  "search_memory",
  "write_memory",
  "open_project",
  "open_url",
]);

/** Tools available to a given mode. Steward: all. Forager/Stinger: read-only. */
export function toolsForMode(mode: QueenBeeMode): ToolDef[] {
  if (mode === "Steward") return TOOLS;
  return TOOLS.filter((t) => !t.mutates);
}

export class ToolError extends Error {}

/**
 * Execute a tool call. Throws ToolError on bad input or when a mode tries a
 * tool it isn't allowed. Returns a short human/LLM-readable result string.
 */
export function executeTool(
  mode: QueenBeeMode,
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): string {
  const def = toolsForMode(mode).find((t) => t.name === name);
  if (!def) {
    throw new ToolError(`Tool "${name}" is not available in ${mode} mode.`);
  }
  for (const req of def.required) {
    if (args[req] === undefined || args[req] === null || args[req] === "") {
      throw new ToolError(`Missing required argument "${req}" for ${name}.`);
    }
  }

  // A declared `enum` is a contract, so enforce it here rather than letting a
  // bad value reach the host and become a CLI flag no binary understands.
  for (const [param, spec] of Object.entries(def.params)) {
    const value = args[param];
    if (spec.enum && value !== undefined && value !== null && value !== "") {
      if (!spec.enum.includes(String(value))) {
        throw new ToolError(
          `Invalid ${param} "${value}" for ${name}. Expected one of: ${spec.enum.join(", ")}.`,
        );
      }
    }
  }

  switch (name) {
    case "create_workhive": {
      const id = ctx.createWorkHive(String(args.name));
      return `Created workhive "${args.name}" (${id}).`;
    }
    case "list_workhives": {
      const ws = ctx.listWorkHives();
      return ws.length
        ? ws.map((w) => `- ${w.name} (${w.id})`).join("\n")
        : "No workHives.";
    }
    case "add_task": {
      ctx.addTask(String(args.title), args.description ? String(args.description) : undefined);
      return `Added task "${args.title}" to Backlog.`;
    }
    case "list_tasks": {
      const tasks = ctx.listTasks();
      return tasks.length
        ? tasks.map((t) => `- [${t.column}] ${t.title} (${t.id})`).join("\n")
        : "No tasks on the board.";
    }
    case "move_task": {
      const col = String(args.column);
      if (!COLUMNS.includes(col)) {
        throw new ToolError(`Invalid column "${col}". Must be one of: ${COLUMNS.join(", ")}.`);
      }
      const ok = ctx.moveTask(String(args.taskId), col);
      if (!ok) throw new ToolError(`No task found with id "${args.taskId}".`);
      return `Moved task ${args.taskId} to ${col}.`;
    }
    case "launch_worker_bee": {
      const model = args.model ? String(args.model) : undefined;
      const effort = args.effort ? String(args.effort) : undefined;
      ctx.launchWorkerBee(
        String(args.cli),
        args.name ? String(args.name) : undefined,
        { model, effort },
      );
      const how = [model && `model ${model}`, effort && `${effort} effort`]
        .filter(Boolean)
        .join(", ");
      return `Launched WorkerBee "${args.name || args.cli}"${how ? ` (${how})` : ""}.`;
    }
    case "launch_terminal": {
      ctx.launchTerminal(args.name ? String(args.name) : undefined);
      return `Opened a terminal${args.name ? ` "${args.name}"` : ""}.`;
    }
    case "set_board": {
      const open = args.open === true || args.open === "true";
      ctx.setBoardOpen(open);
      return open ? "Opened the board." : "Closed the board.";
    }
    case "open_settings": {
      const ok = ctx.openSettings();
      return ok ? "Opened Settings." : "Settings can't be opened from here.";
    }
    case "delete_workhive":
      if (!ctx.deleteWorkHive(String(args.id))) throw new ToolError(`No workhive "${args.id}".`);
      return `Deleted workhive ${args.id}.`;
    case "rename_workhive":
      if (!ctx.renameWorkHive(String(args.id), String(args.name))) throw new ToolError(`No workhive "${args.id}".`);
      return `Renamed workhive ${args.id} to "${args.name}".`;
    case "recolor_workhive":
      if (!ctx.recolorWorkHive(String(args.id), String(args.color))) throw new ToolError(`No workhive "${args.id}".`);
      return `Recolored workhive ${args.id}.`;
    case "switch_workhive":
      if (!ctx.switchWorkHive(String(args.id))) throw new ToolError(`No workhive "${args.id}".`);
      return `Switched to workhive ${args.id}.`;
    case "list_worker_bees": {
      const bees = ctx.listWorkerBees();
      return bees.length ? bees.map((b) => `- ${b.name} (${b.id}) — ${b.cli}`).join("\n") : "No WorkerBees running.";
    }
    case "list_worktrees": {
      const trees = ctx.listWorktrees();
      return trees.length
        ? trees.map((t) => `- ${t.name} (${t.id}) — branch ${t.branch} @ ${t.path}`).join("\n")
        : "No worktrees — dispatched builder tasks will create them.";
    }
    case "remove_worker_bee":
      if (!ctx.removeWorkerBee(String(args.id))) throw new ToolError(`No WorkerBee "${args.id}".`);
      return `Removed WorkerBee ${args.id}.`;
    case "rename_worker_bee":
      if (!ctx.renameWorkerBee(String(args.id), String(args.name))) throw new ToolError(`No WorkerBee "${args.id}".`);
      return `Renamed WorkerBee ${args.id} to "${args.name}".`;
    case "reorder_worker_bee": {
      const from = Number(args.from);
      const to = Number(args.to);
      if (!Number.isInteger(from) || !Number.isInteger(to)) throw new ToolError("from/to must be integers.");
      if (!ctx.reorderWorkerBee(from, to)) throw new ToolError(`Index out of range (from=${from}, to=${to}).`);
      return `Moved WorkerBee from ${from} to ${to}.`;
    }
    case "set_default_worker_bee":
      ctx.setDefaultWorkerBee(String(args.cli));
      return `Default WorkerBee CLI set to "${args.cli}".`;
    case "set_grid_layout": {
      const layout = String(args.layout);
      if (!["auto", "1", "2", "3", "4"].includes(layout)) throw new ToolError(`Invalid layout "${layout}".`);
      ctx.setGridLayout(layout);
      return `Grid layout set to ${layout}.`;
    }
    case "maximize_pane": {
      const id = args.id ? String(args.id) : null;
      ctx.maximizePane(id);
      return id ? `Maximized pane ${id}.` : "Restored the grid.";
    }
    case "refit_terminals":
      ctx.refitTerminals();
      return "Refit all terminals.";
    case "set_left_sidebar": {
      const open = args.open === true || args.open === "true";
      ctx.setLeftSidebar(open);
      return open ? "Showed the left sidebar." : "Hid the left sidebar.";
    }
    case "set_right_dock": {
      const open = args.open === true || args.open === "true";
      ctx.setRightDock(open);
      return open ? "Showed the right dock." : "Hid the right dock.";
    }
    default:
      if (ASYNC_TOOLS.has(name)) {
        // Impure/async (Tauri IPC, git, PTY) — the host intercepts these first.
        throw new ToolError(`${name} must be executed by the host, not executeTool.`);
      }
      throw new ToolError(`Unhandled tool "${name}".`);
  }
}

/** Anthropic Messages API tool schema. */
export function toAnthropicTools(mode: QueenBeeMode) {
  return toolsForMode(mode).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: Object.fromEntries(
        Object.entries(t.params).map(([k, p]) => [
          k,
          p.enum ? { type: p.type, description: p.description, enum: p.enum } : { type: p.type, description: p.description },
        ]),
      ),
      required: t.required,
    },
  }));
}

/** OpenAI Chat Completions function-tool schema. */
export function toOpenAITools(mode: QueenBeeMode) {
  return toolsForMode(mode).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object" as const,
        properties: Object.fromEntries(
          Object.entries(t.params).map(([k, p]) => [
            k,
            p.enum ? { type: p.type, description: p.description, enum: p.enum } : { type: p.type, description: p.description },
          ]),
        ),
        required: t.required,
      },
    },
  }));
}

/** MCP `tools/list` schema — same shape as Anthropic's, different key name. */
export function toMcpTools(mode: QueenBeeMode) {
  return toolsForMode(mode).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: {
      type: "object" as const,
      properties: Object.fromEntries(
        Object.entries(t.params).map(([k, p]) => [
          k,
          p.enum ? { type: p.type, description: p.description, enum: p.enum } : { type: p.type, description: p.description },
        ]),
      ),
      required: t.required,
    },
  }));
}
