import { describe, it, expect, vi } from "vitest";
import { activatable } from "./activatable.js";

/** Minimal stand-in for the React KeyboardEvent fields activatable reads. */
function key(k: string, target?: { tagName: string }) {
  const currentTarget = { tagName: "DIV" };
  return {
    key: k,
    target: target ?? currentTarget,
    currentTarget,
    preventDefault: vi.fn(),
  } as any;
}

describe("activatable", () => {
  it("exposes a button role and a tab stop", () => {
    const props = activatable(() => {});
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
  });

  it("fires on Enter and Space, and blocks Space from scrolling", () => {
    for (const k of ["Enter", " "]) {
      const fn = vi.fn();
      const e = key(k);
      activatable(fn).onKeyDown(e);
      expect(fn).toHaveBeenCalledOnce();
      expect(e.preventDefault).toHaveBeenCalled();
    }
  });

  it("ignores other keys", () => {
    const fn = vi.fn();
    activatable(fn).onKeyDown(key("a"));
    activatable(fn).onKeyDown(key("Tab"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("does not hijack typing in a nested input", () => {
    const fn = vi.fn();
    // Rename fields live inside these rows; Space there means a space.
    activatable(fn).onKeyDown(key(" ", { tagName: "INPUT" }));
    activatable(fn).onKeyDown(key("Enter", { tagName: "TEXTAREA" }));
    expect(fn).not.toHaveBeenCalled();
  });

  it("does not double-fire when a nested button is the target", () => {
    const fn = vi.fn();
    // A strip chip's close button: Enter there must close, not also select.
    activatable(fn).onKeyDown(key("Enter", { tagName: "BUTTON" }));
    activatable(fn).onKeyDown(key(" ", { tagName: "BUTTON" }));
    expect(fn).not.toHaveBeenCalled();
  });

  it("passes the label through for screen readers", () => {
    expect(activatable(() => {}, "Agent swarm")["aria-label"]).toBe("Agent swarm");
  });
});
