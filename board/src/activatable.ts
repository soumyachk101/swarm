import type { KeyboardEvent } from "react";

/**
 * Props that turn a clickable `<div>` row into something a keyboard can reach
 * and fire. Rows (agent entries, tree files, tabs) can't be real `<button>`s
 * because they nest their own buttons, which is invalid HTML. This is the
 * next-best thing: same role, same tab stop, same Enter/Space contract.
 *
 * Spread it next to onClick, don't replace it:
 *   <div onClick={activate} {...activatable(activate)}>
 */
export function activatable(onActivate: () => void, label?: string) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onKeyDown: (e: KeyboardEvent) => {
      // Ignore keys typed into a nested input, and Space inside a text field.
      const t = e.target as HTMLElement;
      if (t !== e.currentTarget && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); // Space would scroll the container otherwise.
        onActivate();
      }
    },
  };
}
