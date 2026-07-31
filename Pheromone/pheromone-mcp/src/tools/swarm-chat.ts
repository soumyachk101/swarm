// Agent-to-agent messaging, available to EVERY agent in the agent — plain
// Agents included, not just the crowned one. The bus itself lives in
// @swarm/mind (coordination is its job); this file only exposes it as MCP
// tools and answers them straight from disk, so the channel keeps working even
// while the app is busy.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { MessageBus, EVERYONE, LEAD } from '@swarm/mind/core';

const fs = {
  mkdir: async (dir: string) => { await mkdir(dir, { recursive: true }); },
  writeFile: async (file: string, content: string) => { await writeFile(file, content, 'utf8'); },
  readFile: (file: string) => readFile(file, 'utf8'),
  readDir: (dir: string) => readdir(dir),
};

/** Who this CLI is on the bus: the crowned agent, or its own pane. */
function whoAmI(): { id: string; name: string } {
  const pane = process.env.SWARM_PANE_ID || 'unknown-pane';
  return process.env.SWARM_LEAD === '1'
    ? { id: LEAD, name: 'Lead' }
    : { id: pane, name: process.env.SWARM_SWARM_NAME || pane };
}

export const SWARM_CHAT_TOOLS = [
  {
    name: 'swarm_send',
    description:
      "Send a message to another agent in this agent. `to` is another agent's pane id (see swarm_who), 'lead' for the Lead, or 'all' to broadcast. Use it to hand work over, ask for a review, or report that you are done — the recipient reads it with swarm_inbox.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        to: { type: 'string', description: "Pane id, 'lead', or 'all'" },
        message: { type: 'string', description: 'What to say' },
      },
      required: ['to', 'message'],
    },
  },
  {
    name: 'swarm_inbox',
    description:
      'Read messages other agents sent you since you last checked (direct and broadcast). Check this when you start work and after finishing a step.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'swarm_who',
    description:
      'Show who you are on the swarm bus and the recent traffic, so you know which pane ids you can address.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
];

export const SWARM_CHAT_TOOL_NAMES = new Set(SWARM_CHAT_TOOLS.map((t) => t.name));

export async function runSwarmChatTool(
  projectPath: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string }> {
  if (!projectPath) return { text: 'Error: no project path — Swarm did not pass --project.' };
  const bus = new MessageBus(projectPath, fs);
  const me = whoAmI();

  if (name === 'swarm_send') {
    const to = String(args.to || '').trim();
    const message = String(args.message || '');
    if (!to) return { text: 'Error: "to" is required (a pane id, "lead", or "all").' };
    if (!message.trim()) return { text: 'Error: refusing to send an empty message.' };
    await bus.send(me.id, to, message, me.name);
    return {
      text: to === EVERYONE
        ? `Broadcast to every agent in this agent.`
        : `Sent to ${to}.`,
    };
  }

  if (name === 'swarm_inbox') {
    const messages = await bus.inbox(me.id);
    if (!messages.length) return { text: 'No new messages.' };
    return {
      text: messages
        .map((m) => {
          const when = new Date(m.ts).toLocaleTimeString();
          const scope = m.to === EVERYONE ? ' (broadcast)' : '';
          return `[${when}] ${m.fromName || m.from}${scope}: ${m.text}`;
        })
        .join('\n'),
    };
  }

  // swarm_who
  const history = await bus.history(20);
  const others = [...new Set(history.map((m) => m.from).filter((f) => f !== me.id))];
  return {
    text: [
      `You are "${me.name}" (address: ${me.id}).`,
      others.length ? `Recently active: ${others.join(', ')}` : 'No other agent has spoken yet.',
      `Address the Lead as "${LEAD}", or everyone as "${EVERYONE}".`,
    ].join('\n'),
  };
}
