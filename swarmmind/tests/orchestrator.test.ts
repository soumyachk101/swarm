import { describe, it, expect, beforeEach } from 'vitest';
import { SwarmMind } from '../src/index.js';
import type { TaskSpec } from '../src/orchestrator.js';

describe('SwarmMind Orchestrator', () => {
  let swarmmind: SwarmMind;

  beforeEach(async () => {
    swarmmind = await SwarmMind.create({
      projectPath: process.cwd(),
    });
  });

  it('should plan tasks with no dependencies', () => {
    const tasks: TaskSpec[] = [
      {
        id: 'task-1',
        description: 'Implement OAuth login',
        owns: ['src/auth/oauth.ts'],
        reads: [],
        dependsOn: [],
        role: 'builder',
        cli: 'opencode',
        missionId: 'mission-1',
      },
    ];

    const result = swarmmind.orchestrator.plan(tasks);
    expect(result.canStart).toHaveLength(1);
    expect(result.canStart[0].id).toBe('task-1');
    expect(result.blocked).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it('should block tasks with unresolved dependencies', () => {
    const tasks: TaskSpec[] = [
      {
        id: 'task-2',
        description: 'Add session handling',
        owns: ['src/auth/session.ts'],
        reads: [],
        dependsOn: ['task-1'],
        role: 'builder',
        cli: 'opencode',
        missionId: 'mission-1',
      },
    ];

    const result = swarmmind.orchestrator.plan(tasks);
    expect(result.canStart).toHaveLength(0);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].task.id).toBe('task-2');
    expect(result.blocked[0].reason).toContain('Waiting on: task-1');
  });

  it('should detect file ownership conflicts', () => {
    swarmmind.locks.acquire('src/auth/oauth.ts', 'task-1');

    const tasks: TaskSpec[] = [
      {
        id: 'task-3',
        description: 'Refactor OAuth',
        owns: ['src/auth/oauth.ts'],
        reads: [],
        dependsOn: [],
        role: 'builder',
        cli: 'opencode',
        missionId: 'mission-1',
      },
    ];

    const result = swarmmind.orchestrator.plan(tasks);
    expect(result.canStart).toHaveLength(0);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].reason).toContain('File conflict');
  });

  it('should dispatch a task and register an agent', async () => {
    const task: TaskSpec = {
      id: 'task-dispatch',
      description: 'Simple task',
      owns: [],
      reads: [],
      dependsOn: [],
      role: 'coordinator',
      cli: 'opencode',
      missionId: 'mission-1',
    };

    const result = await swarmmind.orchestrator.dispatch(task);
    expect(result.agentId).toBeTruthy();

    const agent = swarmmind.registry.get(result.agentId);
    expect(agent).toBeDefined();
    expect(agent!.taskId).toBe('task-dispatch');
    expect(agent!.status).toBe('running');

    const handoff = await swarmmind.handoffs.read('task-dispatch');
    expect(handoff).not.toBeNull();
    expect(handoff!.status).toBe('running');
  });

  it('should complete a task and set awaiting-review status', async () => {
    const task: TaskSpec = {
      id: 'task-complete',
      description: 'Complete me',
      owns: [],
      reads: [],
      dependsOn: [],
      role: 'coordinator',
      cli: 'opencode',
      missionId: 'mission-1',
    };

    const { agentId } = await swarmmind.orchestrator.dispatch(task);
    await swarmmind.orchestrator.complete(agentId);

    const agent = swarmmind.registry.get(agentId);
    expect(agent!.status).toBe('awaiting-review');
  });

  it('should reject a task with reviewer notes', async () => {
    const task: TaskSpec = {
      id: 'task-reject',
      description: 'Reject me',
      owns: [],
      reads: [],
      dependsOn: [],
      role: 'coordinator',
      cli: 'opencode',
      missionId: 'mission-1',
    };

    const { agentId } = await swarmmind.orchestrator.dispatch(task);
    await swarmmind.orchestrator.reject(agentId, 'Scope violation: touched files outside owns list.');

    const agent = swarmmind.registry.get(agentId);
    expect(agent!.status).toBe('failed');

    const handoff = await swarmmind.handoffs.read('task-reject');
    expect(handoff!.reviewerNotes).toBe('Scope violation: touched files outside owns list.');
  });

  it('should find agents by mission', () => {
    expect(swarmmind.registry.findByMission('mission-1')).toHaveLength(0);
    expect(swarmmind.registry.findByMission('mission-2')).toHaveLength(0);

    swarmmind.registry.register({
      id: 'agent-test',
      taskId: 'task-m1',
      cli: 'opencode',
      role: 'builder',
      worktreePath: '',
      branchName: '',
      paneId: 'pane-1',
      status: 'running',
      missionId: 'mission-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(swarmmind.registry.findByMission('mission-1')).toHaveLength(1);
    expect(swarmmind.registry.findByMission('mission-2')).toHaveLength(0);
  });

  it('should manage lock lifecycle', () => {
    const conflict = swarmmind.locks.acquire('src/shared/types.ts', 'task-a');
    expect(conflict).toBeNull();

    const conflict2 = swarmmind.locks.acquire('src/shared/types.ts', 'task-b');
    expect(conflict2).not.toBeNull();
    expect(conflict2!.existingOwner).toBe('task-a');
    expect(conflict2!.requestingTask).toBe('task-b');

    const ownedFiles = swarmmind.locks.getOwnedFiles('task-a');
    expect(ownedFiles).toContain('src/shared/types.ts');

    swarmmind.locks.release('task-a');
    const ownedAfter = swarmmind.locks.getOwnedFiles('task-a');
    expect(ownedAfter).toHaveLength(0);
  });
});
