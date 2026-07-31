/**
 * Per-component-type accents for HoneyBoard.
 *
 * Class color is for identity dots / icons only — pane chrome (headers,
 * borders, bodies) always uses shared `--bee-*` surface tokens so every
 * theme keeps planes visually uniform.
 */
export type ComponentKind = "agent" | "shell" | "openvsx" | "coworker" | "browser" | "emulator" | "toolbox";

export interface ComponentTheme {
  /** Solid accent (class dot, active icon). */
  accent: string;
  /** Low-opacity fill (optional chip wash — prefer dots over fills). */
  accentSoft: string;
  /** Border/edge tint when a class edge is intentionally shown. */
  border: string;
}

// Class colours are deliberately FIXED literals, not theme tokens: the dot is
// how a pane states what it is, so "yellow = WorkerBee" has to hold in every
// theme. If these followed --bee-* they would shift per theme and stop being a
// code. All eight themes are dark, so one set of values reads on all of them.
export const CLASS_COLORS = {
  /** Anything that can be a WorkerBee — a CLI agent, or an agent extension. */
  worker: "#f2c94c",
  /** A plain shell terminal. */
  terminal: "#c6ced6",
  /** An editor extension that cannot be a WorkerBee (a tool). */
  extension: "#5fbf7d",
  browser: "#8ab4d8",
  emulator: "#c58ad8",
  /** The workhive toolbox: skills and MCP servers shared by every bee. */
  toolbox: "#63c6c0",
} as const;

const withAlpha = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const themeFor = (accent: string): ComponentTheme => ({
  accent,
  accentSoft: withAlpha(accent, 0.14),
  border: withAlpha(accent, 0.34),
});

export const COMPONENT_THEMES: Record<string, ComponentTheme> = {
  agent: themeFor(CLASS_COLORS.worker),
  shell: themeFor(CLASS_COLORS.terminal),
  openvsx: themeFor(CLASS_COLORS.extension),
  browser: themeFor(CLASS_COLORS.browser),
  emulator: themeFor(CLASS_COLORS.emulator),
  toolbox: themeFor(CLASS_COLORS.toolbox),
};

/** Theme for a WorkerBee kind; `undefined` (a CLI agent) → the agent theme. */
export function themeForKind(kind?: string): ComponentTheme {
  return COMPONENT_THEMES[kind ?? "agent"] ?? COMPONENT_THEMES.agent;
}

/** Shared pane title-bar classes — identical across agent / shell / openvsx / … */
export const PANE_HEADER_CLASS =
  "h-8 shrink-0 border-b border-bee-border/45 glass-toolbar flex items-center gap-1.5 px-2 cursor-grab active:cursor-grabbing";

/**
 * Spread onto a pane's title bar. Carries the shared classes AND the marker the
 * HoneyFlow canvas drags a node by — without it, dragging anywhere in a pane
 * would move the window out from under a click meant for the terminal.
 */
export const paneHeaderProps = { className: PANE_HEADER_CLASS, "data-pane-header": "true" } as const;
