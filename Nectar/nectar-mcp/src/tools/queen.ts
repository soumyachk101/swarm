// QueenBee's tool surface, exposed to the crowned CLI over MCP.
//
// The tools themselves act on live Hive state (workHives, panes, dispatch), so
// they can't run in this process. Each call is dropped as a request file in
// <project>/.nectar/queen/ and answered by the app; see Hive's queenBridge.
//
// Only advertised when Hive spawned this CLI as the QueenBee (HIVEORY_QUEEN=1),
// so ordinary WorkerBees don't carry 25 orchestration tools they may not use.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toMcpTools, MODE_SYSTEM_PROMPTS } from '@hiveory/queenbee';

export const IS_QUEEN = process.env.HIVEORY_QUEEN === '1';

/** Hiveory publishes the crown's charter to a file rather than typing it into
 *  the agent's prompt. This is how the agent asks for it. */
const QUEEN_ROLE_TOOL = {
  name: 'queen_role',
  description:
    "Read your QueenBee charter AND the map of your territory: which project folder you lead, its git worktrees, its panes and its board. Several projects may be open at once — this tells you which one is yours. Call this first, before planning or acting.",
  inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
};

/** Full set — the app re-checks the live mode and refuses what it must. */
export const QUEEN_TOOLS = IS_QUEEN ? [QUEEN_ROLE_TOOL, ...toMcpTools('Steward')] : [];
export const QUEEN_TOOL_NAMES = new Set(QUEEN_TOOLS.map((t) => t.name));

const POLL_MS = 150;
const TIMEOUT_MS = 120_000; // dispatch_goal spawns worktrees + agents; give it room

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runQueenTool(
  projectPath: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string }> {
  if (!projectPath) return { text: 'Error: no project path — Hive did not pass --project.' };


  const dir = join(projectPath, '.nectar', 'queen');
  mkdirSync(dir, { recursive: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reqPath = join(dir, `req-${id}.json`);
  const resPath = join(dir, `res-${id}.json`);

  // Written to a temp name first so the app never reads a half-written request.
  const tmpPath = join(dir, `tmp-${id}.json`);
  writeFileSync(
    tmpPath,
    JSON.stringify({ id, tool: name, args, paneId: process.env.HIVEORY_PANE_ID, ts: Date.now() }),
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
    if (name === 'queen_role') {
      try {
        return { text: readFileSync(join(projectPath, '.nectar', 'queen', 'ROLE.md'), 'utf8') };
      } catch {
        return { text: MODE_SYSTEM_PROMPTS.Steward };
      }
    }
    return { text: `Error: Hive did not answer ${name} within ${TIMEOUT_MS / 1000}s.` };
  } finally {
    rmSync(reqPath, { force: true });
    rmSync(resPath, { force: true });
  }
}
