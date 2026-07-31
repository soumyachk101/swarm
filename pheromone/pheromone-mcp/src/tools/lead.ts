// Lead's tool surface, exposed to the crowned CLI over MCP.
//
// The tools themselves act on live Swarm state (workspaces, panes, dispatch), so
// they can't run in this process. Each call is dropped as a request file in
// <project>/.pheromone/lead/ and answered by the app; see Swarm's leadBridge.
//
// Only advertised when Swarm spawned this CLI as the Lead (SWARM_LEAD=1),
// so ordinary Agents don't carry 25 orchestration tools they may not use.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toMcpTools, MODE_SYSTEM_PROMPTS } from '@swarm/lead';

export const IS_LEAD = process.env.SWARM_LEAD === '1';

/** Swarm publishes the crown's charter to a file rather than typing it into
 *  the agent's prompt. This is how the agent asks for it. */
const LEAD_ROLE_TOOL = {
  name: 'lead_role',
  description:
    "Read your Lead charter AND the map of your territory: which project folder you lead, its git worktrees, its panes and its board. Several projects may be open at once — this tells you which one is yours. Call this first, before planning or acting.",
  inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
};

/** Full set — the app re-checks the live mode and refuses what it must. */
export const LEAD_TOOLS = IS_LEAD ? [LEAD_ROLE_TOOL, ...toMcpTools('Steward')] : [];
export const LEAD_TOOL_NAMES = new Set(LEAD_TOOLS.map((t) => t.name));

const POLL_MS = 150;
const TIMEOUT_MS = 120_000; // dispatch_goal spawns worktrees + agents; give it room

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runLeadTool(
  projectPath: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string }> {
  if (!projectPath) return { text: 'Error: no project path — Swarm did not pass --project.' };


  const dir = join(projectPath, '.pheromone', 'lead');
  mkdirSync(dir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reqPath = join(dir, `req-${id}.json`);
  const resPath = join(dir, `res-${id}.json`);

  // Written to a temp name first so the app never reads a half-written request.
  const tmpPath = join(dir, `tmp-${id}.json`);
  writeFileSync(
    tmpPath,
    JSON.stringify({ id, tool: name, args, paneId: process.env.SWARM_PANE_ID, ts: Date.now() }),
  );
  writeFileSync(reqPath, readFileSync(tmpPath));
  rmSync(tmpPath, { force: true });

  const deadline = Date.now() + TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      try {
        const raw = readFileSync(resPath, 'utf8');
        const res = JSON.parse(raw);
        return { text: String(res?.text ?? '') };
      } catch {
        // not answered yet
      }
      await sleep(POLL_MS);
    }
    // The charter is also published to disk, so orientation still works when
    // the app is busy or closed — the live scope block is what's missing.
    if (name === 'lead_role') {
      try {
        return { text: readFileSync(join(projectPath, '.pheromone', 'lead', 'ROLE.md'), 'utf8') };
      } catch {
        return { text: MODE_SYSTEM_PROMPTS.Steward };
      }
    }
    return { text: `Error: Swarm did not answer ${name} within ${TIMEOUT_MS / 1000}s.` };
  } finally {
    rmSync(reqPath, { force: true });
    rmSync(resPath, { force: true });
  }
}
