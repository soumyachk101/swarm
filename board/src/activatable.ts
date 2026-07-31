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
const NESTED_CONTROLS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);

export function activatable(onActivate: () => void, label?: string) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onKeyDown: (e: KeyboardEvent) => {
      // Ignore keys aimed at a nested control. Inputs so Space stays a space;
      // buttons/links because the whole reason this helper exists is that these
      // rows nest their own — Enter on a row's close button would otherwise
      // both close the row AND activate it on the way up.
      const t = e.target as HTMLElement;
      if (t !== e.currentTarget && NESTED_CONTROLS.has(t.tagName)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); // Space would scroll the container otherwise.
        onActivate();
      }
    },
  };
}
