import { describe, it, expect, beforeEach } from 'vitest';
import { MessageBus, QUEEN, EVERYONE } from './index.js';
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
  bus = new MessageBus('/hive', fs);
});

describe('MessageBus', () => {
  it('delivers a message from one bee to another', async () => {
    await bus.send('bee-1', 'bee-2', 'auth.ts is ready', 'Builder');
    const inbox = await bus.inbox('bee-2');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].text).toBe('auth.ts is ready');
    expect(inbox[0].fromName).toBe('Builder');
  });

  it('drains — a message is delivered once', async () => {
    await bus.send('bee-1', 'bee-2', 'first');
    expect(await bus.inbox('bee-2')).toHaveLength(1);
    expect(await bus.inbox('bee-2')).toHaveLength(0);
  });

  it('keeps mail private to its recipient', async () => {
    await bus.send('bee-1', 'bee-2', 'for you only');
    expect(await bus.inbox('bee-3')).toHaveLength(0);
    expect(await bus.inbox('bee-2')).toHaveLength(1);
  });

  it('carries messages to and from the queen', async () => {
    await bus.send('bee-1', QUEEN, 'task done');
    expect((await bus.inbox(QUEEN))[0].text).toBe('task done');
    await bus.send(QUEEN, 'bee-1', 'now review it');
    expect((await bus.inbox('bee-1'))[0].text).toBe('now review it');
  });

  it('broadcasts to everyone except the sender', async () => {
    await bus.send(QUEEN, EVERYONE, 'freeze: merging main');
    expect(await bus.inbox('bee-1')).toHaveLength(1);
    expect(await bus.inbox('bee-2')).toHaveLength(1);
    expect(await bus.inbox(QUEEN)).toHaveLength(0);
  });

  it('refuses an empty message rather than posting noise', async () => {
    await expect(bus.send('bee-1', 'bee-2', '   ')).rejects.toThrow();
  });

  it('survives a corrupt line in the log', async () => {
    await bus.send('bee-1', 'bee-2', 'good');
    const path = '/hive/.nectar/agents/messages/inbox.jsonl';
    fs.files.set(path, fs.files.get(path)! + 'not json at all\n');
    const inbox = await bus.inbox('bee-2');
    expect(inbox).toHaveLength(1);
  });

  it('reports history without consuming it', async () => {
    await bus.send('bee-1', EVERYONE, 'hello');
    expect(await bus.history()).toHaveLength(1);
    expect(await bus.inbox('bee-2')).toHaveLength(1);
  });
});
