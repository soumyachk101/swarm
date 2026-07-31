import { joinPath } from '../ports.js';
import type { HandoffFs } from '../ports.js';

/**
 * Direct messaging between agents in one hive.
 *
 * Handoffs and Nectar memory let agents leave notes for whoever comes next —
 * good for context, useless for "ask the reviewer to look at this now". This is
 * the channel: a WorkerBee can message another WorkerBee, either can message
 * the QueenBee, and the QueenBee can address one bee or broadcast to all.
 *
 * It is file-backed under the workhive's own `.nectar/`, so it inherits the same
 * isolation as everything else: agents in different workhives cannot see each
 * other's traffic, and messages survive the app closing.
 */
export interface HiveMessage {
  id: string;
  /** Pane id of the sender, or "queen". */
  from: string;
  /** Human label, so a recipient sees "Builder" rather than a pane id. */
  fromName?: string;
  /** Pane id, "queen", or "all" for a broadcast. */
  to: string;
  text: string;
  /** Unix millis. */
  ts: number;
}

/** The well-known recipient names any agent may address. */
export const QUEEN = 'queen';
export const EVERYONE = 'all';

export class MessageBus {
  private dir: string;

  constructor(nectarRoot: string, private fs: HandoffFs) {
    this.dir = joinPath(nectarRoot, '.nectar', 'agents', 'messages');
  }

  private log = () => joinPath(this.dir, 'inbox.jsonl');
  private cursor = (who: string) => joinPath(this.dir, `cursor-${safe(who)}.txt`);

  private async readLog(): Promise<HiveMessage[]> {
    try {
      const raw = await this.fs.readFile(this.log());
      return raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          try { return JSON.parse(l) as HiveMessage; } catch { return null; }
        })
        .filter((m): m is HiveMessage => m !== null);
    } catch {
      return [];
    }
  }

  /** Post a message. `to` is a pane id, QUEEN, or EVERYONE. */
  async send(
    from: string,
    to: string,
    text: string,
    fromName?: string,
  ): Promise<HiveMessage> {
    if (!text.trim()) throw new Error('Refusing to send an empty message.');
    await this.fs.mkdir(this.dir);
    const message: HiveMessage = {
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
    // Keep the tail only; a hive that has been running for days should not make
    // every inbox read scan a megabyte of settled conversation.
    const capped = existing.slice(-MAX_KEPT);
    await this.fs.writeFile(this.log(), capped.map((m) => JSON.stringify(m)).join('\n') + '\n');
    return message;
  }

  /** Everything addressed to `me` (directly or by broadcast) since last read. */
  async inbox(me: string): Promise<HiveMessage[]> {
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
  async history(limit = 50): Promise<HiveMessage[]> {
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
