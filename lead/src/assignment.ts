import type { LeadTask, Assignment } from './types.js';

export interface AssignmentStrategy {
  name: string;
  assign(tasks: LeadTask[]): Assignment[];
}

export class DefaultAssignmentStrategy implements AssignmentStrategy {
  name = 'default';
  private availableClis = ['opencode', 'claude', 'codex', 'kilo', 'cline', 'agy'];

  assign(tasks: LeadTask[]): Assignment[] {
    const assignments: Assignment[] = [];

    assignments.push({
      taskId: 'coordinator',
      cli: 'opencode',
      role: 'coordinator',
    });

    for (const task of tasks) {
      const cli = this.availableClis[Math.floor(Math.random() * this.availableClis.length)];
      assignments.push({
        taskId: task.id,
        cli: task.suggestedCli || cli,
        role: task.suggestedRole === 'scout' ? 'scout' : 'builder',
      });
    }

    if (tasks.length > 0) {
      assignments.push({
        taskId: 'reviewer',
        cli: 'opencode',
        role: 'reviewer',
      });
    }

    return assignments;
  }
}
