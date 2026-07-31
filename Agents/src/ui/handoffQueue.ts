// agents/handoffs.md is appended by read-modify-write, and every pane flushes
// on its own 10s timer. With several agents in one folder — or several folders
// each with their own agents — two overlapping flushes read the same file and
// the second write silently drops the first entry.
//
// One promise chain per folder serialises them. Different folders never wait on
// each other, so a slow write in one project can't stall another.
//
// ponytail: in-process only, which is enough because every writer is a pane in
// this app. An external editor writing handoffs.md at the same moment would
// still race; that needs a file lock in Rust.
const chains = new Map<string, Promise<unknown>>();

export function withHandoffLock<T>(folder: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(folder) ?? Promise.resolve();
  // Run next regardless of whether the previous write resolved or threw.
  const next = prev.then(fn, fn);
  chains.set(folder, next.catch(() => {}));
  return next;
}
