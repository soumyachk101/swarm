import type { LeadTask } from './types.js';

export interface ReviewResult {
  taskId: string;
  approved: boolean;
  feedback: string;
  updatedTask?: Partial<LeadTask>;
}

export class ReviewRouter {
  route(result: ReviewResult): { action: 'reassign' | 'retry' | 'complete'; targetTaskId?: string } {
    if (result.approved) {
      return { action: 'complete' };
    }

    if (result.updatedTask) {
      return { action: 'reassign', targetTaskId: result.taskId };
    }

    return { action: 'retry', targetTaskId: result.taskId };
  }
}
