import { breakdown } from "@swarm/lead";
import type { LeadTask } from "@swarm/lead";
import type { NewCardInput } from "@swarm/tasks";
import {
  AgentRegistry, LockRegistry, RoleManager, Orchestrator, HandoffManager,
} from "../core.js";
import type { Role, LockConflict } from "../core.js";
import { TauriWorktreeOps, tauriHandoffFs } from "./adapters.js";

// The orchestration spine.
//
//   goal → Lead.breakdown() → SwarmMind.Orchestrator.plan() (lock conflicts)
//        → per task: dispatch() → worktree + handoff + registry → launch swarm
//
// SwarmMind owns every orchestration decision (which roles need a worktree, who
// conflicts with whom, status lifecycle). Swarm supplies Tauri adapters for the
// side effects and the UI hooks — no orchestration policy lives in this file.
//
// GUI-level behaviour (real git worktrees, PTY spawn) can only be verified by
// running the Tauri app; the pure planning below is unit-tested.

export interface WorktreeInfo {
  path: string;
  branch: string;
  task_id: string;
}

export interface DispatchPlanEntry {
  task: LeadTask;
  cli: string;
  needsWorktree: boolean;
}

export interface DispatchResult {
  taskId: string;
  title: string;
  cli: string;
  agentId?: string;
  worktree?: WorktreeInfo;
  /** Set when SwarmMind's lock registry refused the task (file ownership clash). */
  blockedBy?: LockConflict[];
  error?: string;
}

const roles = new RoleManager();

/** Lead suggests a role name; map it onto SwarmMind's role vocabulary. */
function toSwarmMindRole(suggested: string): Role {
  const r = (suggested || "").toLowerCase();
  return r === "builder" || r === "scout" || r === "reviewer" || r === "coordinator"
    ? (r as Role)
    : "builder";
}

/**
 * Pure: turn breakdown tasks into an ordered dispatch plan.
 * Worktree need comes from SwarmMind's RoleManager — the single source of truth.
 */
export function planDispatch(tasks: LeadTask[]): DispatchPlanEntry[] {
  return tasks.map((task) => ({
    task,
    cli: task.suggestedCli || "claude",
    needsWorktree: roles.getDefinition(toSwarmMindRole(task.suggestedRole)).needsWorktree,
  }));
}

export interface DispatchHooks {
  /** Launch the agent pane and return its id, so the card can point at it. */
  launchAgent: (cli: string, name: string, cwd?: string) => string;
  addCard: (card: NewCardInput) => void;
}

function buildOrchestrator(projectPath: string) {
  const registry = new AgentRegistry();
  const locks = new LockRegistry();
  const handoffs = new HandoffManager(projectPath, tauriHandoffFs);
  const orchestrator = new Orchestrator(
    registry, locks, new TauriWorktreeOps(projectPath), handoffs, roles,
  );
  return { registry, locks, handoffs, orchestrator };
}

// One Orchestrator per project, kept for the session.
//
// Locks and the agent registry are *live state*: a per-call instance would drop
// every file lock the moment dispatch returned, so two goals dispatched minutes
// apart could hand the same file to two builders, and approve() would find no
// agent to merge. Keyed by project so separate projects stay isolated.
const orchestrators = new Map<string, ReturnType<typeof buildOrchestrator>>();

export function getOrchestrator(projectPath: string) {
  let existing = orchestrators.get(projectPath);
  if (!existing) {
    existing = buildOrchestrator(projectPath);
    orchestrators.set(projectPath, existing);
  }
  return existing;
}

/** Test seam: drop cached state (also used when a project closes). */
export function resetOrchestrator(projectPath?: string) {
  if (projectPath) orchestrators.delete(projectPath);
  else orchestrators.clear();
}

/**
 * Approve a task's work: merge its branch back and let SwarmMind release the
 * file locks and mark the registry/handoff merged. Falls back to a direct merge
 * when the agent isn't in the registry (e.g. dispatched before a reload), so
 * approval still works — just without the bookkeeping.
 */
export async function approveTask(
  projectPath: string,
  taskId: string,
  fallback: { branch: string; worktreePath: string },
): Promise<{ merged: boolean; viaOrchestrator: boolean }> {
  const { registry, orchestrator } = getOrchestrator(projectPath);
  const agent = registry.findByTask(taskId);
  if (agent) {
    await orchestrator.approve(agent.id);
    return { merged: true, viaOrchestrator: true };
  }
  await new TauriWorktreeOps(projectPath).mergeAndRemove(fallback.worktreePath, fallback.branch);
  return { merged: true, viaOrchestrator: false };
}

/**
 * Reject a task's work: hand the worktree back to the Agent for rework.
 * SwarmMind marks the agent failed and records reviewer notes in the handoff —
 * the worktree and its file locks stay put so the swarm can revise in place.
 */
export async function rejectTask(
  projectPath: string,
  taskId: string,
  reviewerNotes: string,
): Promise<{ viaOrchestrator: boolean }> {
  const { registry, orchestrator } = getOrchestrator(projectPath);
  const agent = registry.findByTask(taskId);
  if (!agent) return { viaOrchestrator: false };
  await orchestrator.reject(agent.id, reviewerNotes);
  return { viaOrchestrator: true };
}

/**
 * Execute a goal end-to-end: break it down, ask SwarmMind whether each task can
 * start (file-ownership locks), then dispatch it — worktree, handoff, registry,
 * Agent, board card. Returns per-task outcomes; one failure does not abort
 * the rest.
 */
export async function dispatchGoal(
  goal: string,
  projectPath: string,
  hooks: DispatchHooks,
  pheromoneContext?: string,
): Promise<DispatchResult[]> {
  const { tasks } = await breakdown({ goal, pheromoneContext });
  const plan = planDispatch(tasks);
  const results: DispatchResult[] = [];

  const { orchestrator, handoffs } = getOrchestrator(projectPath);
  if (projectPath) {
    try { await handoffs.ensureStructure(); } catch { /* handoffs are best-effort */ }
  }

  // One goal = one mission; it groups this goal's tasks in the registry and in
  // `.pheromone/agents/handoffs/` (HandoffManager.listByMission keys on this).
  const missionId = `m${Date.now().toString(36)}`;

  for (const { task, cli } of plan) {
    const result: DispatchResult = { taskId: task.id, title: task.description, cli };
    const spec = {
      id: task.id,
      description: task.description,
      owns: task.owns ?? [],
      reads: task.reads ?? [],
      dependsOn: task.dependsOn ?? [],
      role: toSwarmMindRole(task.suggestedRole),
      cli,
      missionId,
    };

    try {
      // Ask SwarmMind first: two builders owning the same file must not both run.
      const check = orchestrator.plan([spec]);
      if (!check.canStart.some((t) => t.id === task.id)) {
        result.blockedBy = check.conflicts;
        // Still surface it on the board, flagged — a blocked task that appears
        // nowhere is worse than one shown as blocked.
        hooks.addCard({
          id: task.id,
          title: task.description,
          description: `owns: ${task.owns?.join(", ") || "—"}`,
          column: "backlog",
          owns: task.owns ?? [],
          reads: task.reads ?? [],
          dependsOn: task.dependsOn ?? [],
          assignedRole: spec.role,
          assignedCli: cli,
          missionId,
          blockingReason: check.conflicts
            .map((c) => `${c.filePath} owned by ${c.existingOwner}`)
            .join("; "),
        });
        results.push(result);
        continue;
      }

      const { agentId, worktree } = await orchestrator.dispatch(spec);
      result.agentId = agentId;
      if (worktree) {
        result.worktree = { path: worktree.path, branch: worktree.branch, task_id: worktree.taskId };
      }

      const paneAgentId = hooks.launchAgent(cli, task.description.slice(0, 40), worktree?.path);

      // The card must carry the agent link, or the pipeline can never show the
      // task as running: nodeStatus() reads agent status via paneAgentId.
      hooks.addCard({
        id: task.id,
        title: task.description,
        description: `owns: ${task.owns?.join(", ") || "—"}`,
        column: "in-progress",
        owns: task.owns ?? [],
        reads: task.reads ?? [],
        dependsOn: task.dependsOn ?? [],
        assignedRole: spec.role,
        assignedCli: cli,
        missionId,
        agentId: paneAgentId,
        worktreeBranch: worktree?.branch,
      });
    } catch (e) {
      result.error = (e as Error)?.message || String(e);
    }
    results.push(result);
  }
  return results;
}
