import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { randomUUID } from 'crypto';

/**
 * Plans: state-tracked "mission documents" that keep an agent's
 * architectural intent stable across a long task (the fix for context decay).
 *
 * A plan is ONE markdown file at `.pheromone/plans/<id>.md`. The frontmatter is the
 * source of truth (status, steps, evidence); the body is a human-readable render
 * regenerated on every write, so the file stays git-diffable and readable while
 * agents drive it through MCP tools. No DB table — the filesystem is the store.
 */

export type PlanStatus = 'draft' | 'active' | 'done';
export type StepStatus = 'pending' | 'in_progress' | 'done';

export interface PlanStep {
  text: string;
  status: StepStatus;
}

export interface Evidence {
  label: string;
  content: string;
  at: number;
}

export interface Plan {
  id: string;
  title: string;
  domain?: string;
  status: PlanStatus;
  description: string;
  steps: PlanStep[];
  evidence: Evidence[];
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

type PlanData = Omit<Plan, 'description'>;

export class PlanManager {
  private dir: string;

  constructor(projectPath: string) {
    this.dir = path.join(projectPath, '.pheromone', 'plans');
  }

  async ensureStructure(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.md`);
  }

  async createPlan(input: {
    title: string;
    description?: string;
    domain?: string;
    steps?: string[];
  }): Promise<Plan> {
    await this.ensureStructure();
    const now = Date.now();
    const plan: Plan = {
      id: randomUUID().slice(0, 8),
      title: input.title,
      domain: input.domain,
      status: 'active',
      description: input.description ?? '',
      steps: (input.steps ?? []).map((text) => ({ text, status: 'pending' })),
      evidence: [],
      createdAt: now,
      updatedAt: now,
    };
    await this.write(plan);
    return plan;
  }

  async getPlan(id: string): Promise<Plan | null> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file(id), 'utf-8');
    } catch {
      return null;
    }
    const parsed = matter(raw);
    const d = parsed.data as Partial<PlanData>;
    return {
      id,
      title: d.title ?? id,
      domain: d.domain,
      status: d.status ?? 'active',
      description: (d as any).description ?? extractDescription(parsed.content),
      steps: d.steps ?? [],
      evidence: d.evidence ?? [],
      summary: d.summary,
      createdAt: d.createdAt ?? 0,
      updatedAt: d.updatedAt ?? 0,
    };
  }

  async listPlans(): Promise<Plan[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.dir);
    } catch {
      return [];
    }
    const ids = files.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
    const plans = await Promise.all(ids.map((id) => this.getPlan(id)));
    return plans.filter((p): p is Plan => p !== null).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async updateStep(id: string, stepIndex: number, status: StepStatus): Promise<Plan> {
    const plan = await this.require(id);
    if (stepIndex < 0 || stepIndex >= plan.steps.length) {
      throw new Error(`step ${stepIndex} out of range (plan has ${plan.steps.length} steps)`);
    }
    plan.steps[stepIndex].status = status;
    plan.updatedAt = Date.now();
    await this.write(plan);
    return plan;
  }

  async captureEvidence(id: string, label: string, content: string): Promise<Plan> {
    const plan = await this.require(id);
    plan.evidence.push({ label, content, at: Date.now() });
    plan.updatedAt = Date.now();
    await this.write(plan);
    return plan;
  }

  /**
   * Mark done + record the knowledge-harvest summary. Returns the plan and the
   * summary text so the caller can also inject it into searchable memory.
   */
  async markDone(id: string, summary: string): Promise<Plan> {
    const plan = await this.require(id);
    plan.status = 'done';
    plan.summary = summary;
    plan.updatedAt = Date.now();
    await this.write(plan);
    return plan;
  }

  private async require(id: string): Promise<Plan> {
    const plan = await this.getPlan(id);
    if (!plan) throw new Error(`plan not found: ${id}`);
    return plan;
  }

  private async write(plan: Plan): Promise<void> {
    const body = renderBody(plan);
    // Keep description in frontmatter too so getPlan reads it back verbatim
    // regardless of body formatting. Drop undefined keys — gray-matter's YAML
    // dumper throws on them.
    const data: Record<string, unknown> = { ...plan };
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    await fs.writeFile(this.file(plan.id), matter.stringify(body, data), 'utf-8');
  }
}

const MARK: Record<StepStatus, string> = { pending: ' ', in_progress: '~', done: 'x' };

function renderBody(plan: Plan): string {
  const lines = [`# ${plan.title}`, ''];
  if (plan.domain) lines.push(`**Domain:** ${plan.domain}`, '');
  lines.push(`**Status:** ${plan.status}`, '');
  if (plan.description) lines.push(plan.description, '');
  if (plan.steps.length) {
    lines.push('## Steps', '');
    plan.steps.forEach((s) => lines.push(`- [${MARK[s.status]}] ${s.text}`));
    lines.push('');
  }
  if (plan.evidence.length) {
    lines.push('## Evidence', '');
    plan.evidence.forEach((e) =>
      lines.push(`### ${e.label} _(${new Date(e.at).toISOString()})_`, '', e.content, ''),
    );
  }
  if (plan.summary) lines.push('## Knowledge Harvest', '', plan.summary, '');
  return lines.join('\n');
}

function extractDescription(body: string): string {
  // Fallback only: strip the leading H1 and metadata lines.
  const line = body.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('**'));
  return line?.trim() ?? '';
}
