import { executeTool, ToolError, ASYNC_TOOLS } from '../tools.js';
import { MODE_SYSTEM_PROMPTS } from '../modes.js';
import type { LeadMode } from '../modes.js';
import { TauriPheromone as Pheromone } from '@swarm/pheromone/tauri';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { leadHost } from './host.js';

// Lead's powers, unchanged from when she was a chat agent — only the caller
// moved. The crowned Agent's CLI reaches these through the lead MCP
// server and the request bridge in ./leadBridge.
//
// Everything is scoped to the lead's OWN folder: with several folders open,
// each lead sees only its own board, panes and trees. Synchronous tools run
// against the agent bindings the app registered (ToolContext); the async
// ones use the host's capabilities plus Pheromone directly.

/**
 * Run one Lead tool against the live app. `mode` gates it exactly as it did
 * in the chat: Steward may mutate, Forager and Stinger are read-only auditors.
 * Never throws — errors come back as text the CLI can read.
 */
export async function runLeadTool(
  mode: LeadMode,
  name: string,
  args: Record<string, unknown>,
  projectPath: string,
): Promise<string> {
  const host = leadHost();
  const wsId = host.workspaceIdForFolder(projectPath);
  if (!wsId) return `Error: no agent is bound to ${projectPath}.`;
  const ctx = host.toolContext(wsId);
  try {
    // The charter plus a live map of this lead's territory. Answered here (not
    // from the published file) so the folder, trees and panes are current.
    if (name === 'lead_role') {
      return `${MODE_SYSTEM_PROMPTS[mode]}

${host.describeScope(projectPath)}`;
    }

    if (ASYNC_TOOLS.has(name)) {
      if (name === 'capture_browser_screenshot') {
        const url = args.url ? String(args.url) : undefined;
        const shot = await host.captureBrowser(url);
        if (!shot) return 'No browser pane is open. Ask the user to click Browser in the toolbar first.';
        return `Screenshot captured of ${shot.url}. Read it from the browser pane — this bridge returns text only.`;
      }

      // Read-only memory tools — every mode needs them to audit the project.
      if (name === 'list_memory_files' || name === 'read_memory_file' || name === 'search_memory') {
        if (!projectPath) throw new ToolError('No project is open.');
        const pheromone = new Pheromone(projectPath);
        if (name === 'list_memory_files') {
          const res = await pheromone.listMemoryFiles();
          const files = res?.files ?? [];
          return files.length ? files.map((f: string) => `- ${f}`).join('\n') : 'No memory files.';
        }
        if (name === 'read_memory_file') {
          const path = String(args.path || '');
          if (!path) throw new ToolError('Missing required argument "path" for read_memory_file.');
          const res = await pheromone.readMemoryFile(path);
          return res?.content || `(empty or missing: ${path})`;
        }
        const query = String(args.query || '');
        if (!query) throw new ToolError('Missing required argument "query" for search_memory.');
        const res = await pheromone.search(query, { limit: 5 });
        const hits = res?.results ?? [];
        return hits.length
          ? hits.map((h: any) => `- [${h.score?.toFixed?.(3) ?? '?'}] ${h.chunk?.source_file ?? '?'}: ${String(h.chunk?.content ?? '').slice(0, 200)}`).join('\n')
          : 'No memory matches.';
      }

      if (name === 'list_dispatched') {
        const items = host.dispatchedIn(projectPath);
        return items.length
          ? items.map((d) => `- ${d.taskId}: ${d.title} (${d.cli}) @ ${d.branch}`).join('\n')
          : 'Nothing dispatched is awaiting approval.';
      }

      // Stinger's one action: a read-only security review in its own Agent.
      if (name === 'run_stinger_scan') {
        if (!projectPath) throw new ToolError('No project is open.');
        const scanPath = args.path ? String(args.path) : projectPath;
        host.launchSwarm(wsId, 'claude', 'Stinger scan', ['--cwd', scanPath]);
        return `Launched a Stinger security review over ${scanPath}. Findings appear in its Agent pane.`;
      }

      if (mode !== 'Steward') throw new ToolError(`Tool "${name}" is not available in ${mode} mode.`);

      if (name === 'write_memory') {
        if (!projectPath) throw new ToolError('No project is open.');
        const path = String(args.path || '');
        const content = String(args.content ?? '');
        if (!path) throw new ToolError('Missing required argument "path" for write_memory.');
        const pheromone = new Pheromone(projectPath);
        await pheromone.writeMemoryFile(path, content);
        return `Wrote ${content.length} chars to .pheromone/memory/${path}.`;
      }

      if (name === 'open_project') {
        throw new ToolError('Only the user can open a project folder — ask them to pick one.');
      }

      if (name === 'open_url') {
        const url = String(args.url || 'http://localhost:3000');
        await shellOpen(url);
        return `Opened ${url} in the browser.`;
      }

      if (name === 'approve_task') {
        const taskId = String(args.taskId || '');
        if (!taskId) throw new ToolError('Missing required argument "taskId" for approve_task.');
        if (!host.dispatchedIn(projectPath).some((d) => d.taskId === taskId)) {
          throw new ToolError(`No dispatched task "${taskId}" awaiting approval.`);
        }
        // Through SwarmMind so the merge also releases file locks and marks the
        // registry + handoff merged — a bare merge would leave the orchestrator
        // believing the task still owns its files.
        const { viaOrchestrator, branch } = await host.approveTask(projectPath, taskId);
        return `Merged ${branch} into the project and removed its worktree.${
          viaOrchestrator ? ' Locks released.' : ''
        }`;
      }

      if (name === 'reject_task') {
        const taskId = String(args.taskId || '');
        if (!taskId) throw new ToolError('Missing required argument "taskId" for reject_task.');
        if (!host.dispatchedIn(projectPath).some((d) => d.taskId === taskId)) {
          throw new ToolError(`No dispatched task "${taskId}" awaiting review.`);
        }
        const notes = String(args.notes || 'Please revise and resubmit.');
        // The worktree and its locks stay so the swarm reworks in place and a
        // later approve_task can merge the revised branch.
        const { viaOrchestrator, branch } = await host.rejectTask(projectPath, taskId, notes);
        return `Rejected ${branch} — handed back to the Agent for rework.${
          viaOrchestrator ? '' : ' (agent no longer tracked; worktree left in place)'
        }`;
      }

      if (name === 'dispatch_goal') {
        const goal = String(args.goal || '');
        if (!goal) throw new ToolError('Missing required argument "goal" for dispatch_goal.');
        const results = await host.dispatchGoal(goal, projectPath, wsId);
        // A lock-blocked task has no error and no worktree — it must not be
        // reported as dispatched, or Lead claims work that never ran.
        const blocked = results.filter((r) => r.blockedBy?.length);
        const failed = results.filter((r) => r.error);
        const ok = results.filter((r) => !r.error && !r.blockedBy?.length);
        const lines = results.map((r) => {
          if (r.error) return `- [failed] ${r.title}: ${r.error}`;
          if (r.blockedBy?.length) {
            const who = r.blockedBy.map((c) => `${c.filePath} (owned by ${c.existingOwner})`).join(', ');
            return `- [blocked] ${r.title}: ${who}`;
          }
          return `- [dispatched] ${r.title} (${r.cli})${r.worktree ? ` @ ${r.worktree.branch}` : ''}`;
        });
        const suffix = [
          failed.length ? `${failed.length} failed` : '',
          blocked.length ? `${blocked.length} blocked` : '',
        ].filter(Boolean).join(', ');
        return `Dispatched ${ok.length}/${results.length} task(s)${suffix ? `, ${suffix}` : ''}:\n${lines.join('\n')}`;
      }
    }
    return executeTool(mode, name, args, ctx);
  } catch (e) {
    if (e instanceof ToolError) return `Error: ${e.message}`;
    return `Error: ${(e as Error)?.message || 'tool failed'}`;
  }
}
