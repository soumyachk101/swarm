// Plan tools: state-tracked mission docs that keep an agent's
// intent stable across a long task. All storage/logic lives in the shared
// `@swarm/pheromone` PlanManager (Pheromone/src/plans) — this file only maps MCP
// tool calls onto it and, on completion, harvests the summary into searchable
// memory so future sessions inherit the lesson.
import { PlanManager, MemoryManager, PheromoneDatabase } from '@swarm/pheromone';

type ToolResult = { text: string };

export const PLAN_TOOLS = [
  {
    name: 'pheromone_create_plan',
    description:
      'Create a state-tracked plan (mission document) before implementing a feature. ' +
      'Use plan-first: never code a non-trivial change without one. Returns the plan id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short plan title, e.g. "Authentication Flow"' },
        description: { type: 'string', description: 'What the plan achieves (optional)' },
        domain: { type: 'string', description: 'Architectural domain, e.g. "Identity" (optional)' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered implementation steps (optional)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'pheromone_update_plan_step',
    description: 'Mark a plan step pending/in_progress/done as you implement it.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        step_index: { type: 'number', description: '0-based step index' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
      },
      required: ['plan_id', 'step_index', 'status'],
    },
  },
  {
    name: 'pheromone_capture_evidence',
    description: 'Attach a verifiable result/log (test output, benchmark, decision) to a plan.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        label: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['plan_id', 'label', 'content'],
    },
  },
  {
    name: 'pheromone_mark_plan_done',
    description:
      'Complete a plan with a knowledge-harvest summary (lessons learned, decisions). ' +
      'The summary is saved into project memory so future agents inherit it.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        summary: { type: 'string', description: 'Lessons learned + architectural decisions' },
      },
      required: ['plan_id', 'summary'],
    },
  },
  {
    name: 'pheromone_list_plans',
    description: 'List all plans (most recently updated first) with status and step progress.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

export const PLAN_TOOL_NAMES = new Set(PLAN_TOOLS.map((t) => t.name));

export async function runPlanTool(
  projectPath: string,
  name: string,
  args: any,
): Promise<ToolResult> {
  const pm = new PlanManager(projectPath);

  switch (name) {
    case 'pheromone_create_plan': {
      const plan = await pm.createPlan({
        title: args.title,
        description: args.description,
        domain: args.domain,
        steps: args.steps,
      });
      return {
        text:
          `Created plan ${plan.id}: "${plan.title}"` +
          (plan.steps.length ? ` with ${plan.steps.length} steps.` : '.') +
          ` Use pheromone_update_plan_step with plan_id "${plan.id}" as you work.`,
      };
    }
    case 'pheromone_update_plan_step': {
      const plan = await pm.updateStep(args.plan_id, args.step_index, args.status);
      const done = plan.steps.filter((s) => s.status === 'done').length;
      return { text: `Step ${args.step_index} → ${args.status}. Progress: ${done}/${plan.steps.length}.` };
    }
    case 'pheromone_capture_evidence': {
      await pm.captureEvidence(args.plan_id, args.label, args.content);
      return { text: `Captured evidence "${args.label}" on plan ${args.plan_id}.` };
    }
    case 'pheromone_mark_plan_done': {
      const plan = await pm.markDone(args.plan_id, args.summary);
      await harvestToMemory(projectPath, plan.title, plan.summary ?? args.summary);
      return { text: `Plan ${plan.id} done. Summary harvested into project memory.` };
    }
    case 'pheromone_list_plans': {
      const plans = await pm.listPlans();
      if (!plans.length) return { text: 'No plans yet. Create one with pheromone_create_plan.' };
      const text = plans
        .map((p) => {
          const done = p.steps.filter((s) => s.status === 'done').length;
          return `- [${p.status}] ${p.id} "${p.title}"${p.domain ? ` (${p.domain})` : ''} — ${done}/${p.steps.length} steps`;
        })
        .join('\n');
      return { text };
    }
    default:
      throw new Error(`unknown plan tool: ${name}`);
  }
}

/**
 * Knowledge harvest: append the plan's summary to `.pheromone/memory/decisions.md`
 * and index it, so `pheromone_query` surfaces it in future sessions.
 */
async function harvestToMemory(projectPath: string, title: string, summary: string): Promise<void> {
  const db = await PheromoneDatabase.create(projectPath);
  try {
    const mem = new MemoryManager(db, projectPath);
    await mem.ensureStructure();
    const rel = 'memory/decisions.md';
    const existing = (await mem.readMemoryFile(rel))?.content ?? '# Architecture Decisions\n';
    const entry = `\n## ${title} (${new Date().toISOString().slice(0, 10)})\n\n${summary}\n`;
    await mem.writeMemoryFile(rel, existing + entry);
  } finally {
    await db.close();
  }
}
