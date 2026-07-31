import { describe, it, expect, beforeEach } from 'vitest';
import { MessageBus, LEAD, EVERYONE } from './index.js';
import type { HandoffFs } from '../ports.js';

// In-memory fs so the bus is tested as pure logic.
function memoryFs(): HandoffFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    mkdir: async () => {},
    writeFile: async (f, c) => { files.set(f, c); },
    readFile: async (f) => {
      const v = files.get(f);
      if (v === undefined) throw new Error('ENOENT');
      return v;
    },
    readDir: async () => [...files.keys()],
  };
}

let fs: ReturnType<typeof memoryFs>;
let bus: MessageBus;

beforeEach(() => {
  fs = memoryFs();
  bus = new MessageBus('/swarm', fs);
});

describe('MessageBus', () => {
  it('delivers a message from one swarm to another', async () => {
    await bus.send('swarm-1', 'swarm-2', 'auth.ts is ready', 'Builder');
    const inbox = await bus.inbox('swarm-2');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].text).toBe('auth.ts is ready');
    expect(inbox[0].fromName).toBe('Builder');
  });

  it('drains — a message is delivered once', async () => {
    await bus.send('swarm-1', 'swarm-2', 'first');
    expect(await bus.inbox('swarm-2')).toHaveLength(1);
    expect(await bus.inbox('swarm-2')).toHaveLength(0);
  });

  it('keeps mail private to its recipient', async () => {
    await bus.send('swarm-1', 'swarm-2', 'for you only');
    expect(await bus.inbox('swarm-3')).toHaveLength(0);
    expect(await bus.inbox('swarm-2')).toHaveLength(1);
  });

  it('carries messages to and from the lead', async () => {
    await bus.send('swarm-1', LEAD, 'task done');
    expect((await bus.inbox(LEAD))[0].text).toBe('task done');
    await bus.send(LEAD, 'swarm-1', 'now review it');
    expect((await bus.inbox('swarm-1'))[0].text).toBe('now review it');
  });

  it('broadcasts to everyone except the sender', async () => {
    await bus.send(LEAD, EVERYONE, 'freeze: merging main');
    expect(await bus.inbox('swarm-1')).toHaveLength(1);
    expect(await bus.inbox('swarm-2')).toHaveLength(1);
    expect(await bus.inbox(LEAD)).toHaveLength(0);
  });

  it('refuses an empty message rather than posting noise', async () => {
    await expect(bus.send('swarm-1', 'swarm-2', '   ')).rejects.toThrow();
  });

  it('survives a corrupt line in the log', async () => {
    await bus.send('swarm-1', 'swarm-2', 'good');
    const path = '/swarm/.pheromone/agents/messages/inbox.jsonl';
    fs.files.set(path, fs.files.get(path)! + 'not json at all\n');
    const inbox = await bus.inbox('swarm-2');
    expect(inbox).toHaveLength(1);
  });

  it('reports history without consuming it', async () => {
    await bus.send('swarm-1', EVERYONE, 'hello');
    expect(await bus.history()).toHaveLength(1);
    expect(await bus.inbox('swarm-2')).toHaveLength(1);
  });
});
