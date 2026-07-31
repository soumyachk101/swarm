import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PlanManager } from '../src/plans/index.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pheromone-plans-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('PlanManager', () => {
  it('creates, tracks steps, captures evidence, and harvests on done', async () => {
    const pm = new PlanManager(dir);
    const plan = await pm.createPlan({
      title: 'Auth Flow',
      domain: 'Identity',
      description: 'Add login',
      steps: ['design', 'implement'],
    });
    expect(plan.status).toBe('active');
    expect(plan.steps).toHaveLength(2);

    await pm.updateStep(plan.id, 0, 'done');
    await pm.captureEvidence(plan.id, 'test log', 'all green');
    const done = await pm.markDone(plan.id, 'lesson learned');

    const reloaded = await pm.getPlan(plan.id);
    expect(reloaded!.steps[0].status).toBe('done');
    expect(reloaded!.evidence[0].content).toBe('all green');
    expect(reloaded!.status).toBe('done');
    expect(reloaded!.summary).toBe('lesson learned');
    expect(reloaded!.description).toBe('Add login');
    expect(done.summary).toBe('lesson learned');

    // file is human-readable markdown
    const raw = await fs.readFile(path.join(dir, '.pheromone', 'plans', `${plan.id}.md`), 'utf-8');
    expect(raw).toContain('# Auth Flow');
    expect(raw).toContain('- [x] design');
  });

  it('rejects bad step index and missing plan', async () => {
    const pm = new PlanManager(dir);
    const plan = await pm.createPlan({ title: 'X', steps: ['a'] });
    await expect(pm.updateStep(plan.id, 5, 'done')).rejects.toThrow('out of range');
    await expect(pm.captureEvidence('nope', 'l', 'c')).rejects.toThrow('not found');
    expect(await pm.getPlan('nope')).toBeNull();
    expect(await pm.listPlans()).toHaveLength(1);
  });
});
