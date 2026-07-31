/**
 * One window-resize listener shared by every open pane.
 *
 * Each pane used to attach its own `resize` handler behind its own debounce,
 * so dragging the window edge woke N independent timers that fired at N
 * slightly different moments: panes visibly reflowed one after another and
 * each queued its own pty-resize IPC on the same channel. That stagger is what
 * made resizing feel laggy and out of sync rather than live.
 *
 * Subscribers now share a single rAF-coalesced tick, so every pane measures
 * against the same laid-out frame and refits together. Deliberately dumb: a
 * Set and one listener, attached on the first subscribe and detached on the
 * last, so a board with no panes open costs nothing.
 */

const subscribers = new Set<() => void>();
let frame = 0;

function tick(): void {
  frame = 0;
  // Snapshot first: a subscriber that unsubscribes while running (a pane
  // unmounting mid-resize) must not mutate the set we're iterating.
  for (const fn of [...subscribers]) {
    try {
      fn();
    } catch (e) {
      // One pane failing to refit must never stop the rest from refitting.
      console.warn("[paneResize] subscriber failed:", e);
    }
  }
}

function onResize(): void {
  // A drag emits resize events far faster than the compositor paints;
  // measuring more than once per frame buys nothing but layout thrash.
  if (frame) return;
  frame = requestAnimationFrame(tick);
}

/** Subscribe to coordinated window resizes. Returns the unsubscribe fn. */
export function onWindowResize(fn: () => void): () => void {
  if (subscribers.size === 0) window.addEventListener("resize", onResize);
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      window.removeEventListener("resize", onResize);
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }
  };
}
