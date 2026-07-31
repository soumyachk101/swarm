import { joinPath } from '../ports.js';
import type { HandoffFs } from '../ports.js';

/**
 * Direct messaging between agents in one swarm.
 *
 * Handoffs and Pheromone memory let agents leave notes for whoever comes next —
 * good for context, useless for "ask the reviewer to look at this now". This is
 * the channel: a Agent can message another Agent, either can message
 * the Lead, and the Lead can address one swarm or broadcast to all.
 *
 * It is file-backed under the agent's own `.pheromone/`, so it inherits the same
 * isolation as everything else: agents in different agents cannot see each
 * other's traffic, and messages survive the app closing.
 */
export interface SwarmMessage {
  id: string;
  /** Pane id of the sender, or "lead". */
  from: string;
  /** Human label, so a recipient sees "Builder" rather than a pane id. */
  fromName?: string;
  /** Pane id, "lead", or "all" for a broadcast. */
  to: string;
  text: string;
  /** Unix millis. */
  ts: number;
}

/** The well-known recipient names any agent may address. */
export const LEAD = 'lead';
export const EVERYONE = 'all';

export class MessageBus {
  private dir: string;

  constructor(pheromoneRoot: string, private fs: HandoffFs) {
    this.dir = joinPath(pheromoneRoot, '.pheromone', 'agents', 'messages');
  }

  private log = () => joinPath(this.dir, 'inbox.jsonl');
  private cursor = (who: string) => joinPath(this.dir, `cursor-${safe(who)}.txt`);

  private async readLog(): Promise<SwarmMessage[]> {
    try {
      const raw = await this.fs.readFile(this.log());
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          try { return JSON.parse(l) as SwarmMessage; } catch { return null; }
        })
        .filter((m): m is SwarmMessage => m !== null);
    } catch {
      return [];
    }
  }

  /** Post a message. `to` is a pane id, LEAD, or EVERYONE. */
  async send(
    from: string,
    to: string,
    text: string,
    fromName?: string,
  ): Promise<SwarmMessage> {
    if (!text.trim()) throw new Error('Refusing to send an empty message.');
    await this.fs.mkdir(this.dir);
    const message: SwarmMessage = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      fromName,
      to,
      text: text.trim(),
      ts: Date.now(),
    };
    // One append-only log rather than a file per recipient: a broadcast is then
    // a single write that every reader sees, and nobody has to know the roster.
    const existing = await this.readLog();
    existing.push(message);
    // Keep the tail only; a swarm that has been running for days should not make
    // every inbox read scan a megabyte of settled conversation.
    const capped = existing.slice(-MAX_KEPT);
    await this.fs.writeFile(this.log(), capped.map((m) => JSON.stringify(m)).join('\n') + '\n');
    return message;
  }

  /** Everything addressed to `me` (directly or by broadcast) since last read. */
  async inbox(me: string): Promise<SwarmMessage[]> {
    const all = await this.readLog();
    const seen = await this.readCursor(me);
    const mine = all.filter(
      (m) => m.ts > seen && m.from !== me && (m.to === me || m.to === EVERYONE),
    );
    if (mine.length) {
      await this.fs.mkdir(this.dir);
      await this.fs.writeFile(this.cursor(me), String(mine[mine.length - 1].ts));
    }
    return mine;
  }

  /** Read without consuming — for a UI that wants to show the traffic. */
  async history(limit = 50): Promise<SwarmMessage[]> {
    return (await this.readLog()).slice(-limit);
  }

  private async readCursor(me: string): Promise<number> {
    try {
      return Number(await this.fs.readFile(this.cursor(me))) || 0;
    } catch {
      return 0;
    }
  }
}

const MAX_KEPT = 500;

/** Pane ids are safe already; this guards a hand-written recipient name. */
function safe(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
