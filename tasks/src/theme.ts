/**
 * Board colours — semantic status mapped to live theme tokens so ThemePicker
 * recolors Tasks boards with the rest of the app.
 */
export const STATUS_COLORS = {
  /** Nothing has happened yet — muted text. */
  idle: "rgb(var(--swarm-text-muted))",
  /** Queued or waiting — dim text (cool "blade" feel without a fixed hex). */
  queued: "rgb(var(--swarm-text-dim))",
  /** Working right now — theme accent. */
  active: "rgb(var(--swarm-gold))",
  /** Awaiting a human — secondary accent. */
  review: "rgb(var(--swarm-honey))",
  /** Finished well. */
  done: "rgb(var(--swarm-ok))",
  /** Broken or blocked. */
  failed: "rgb(var(--swarm-err))",
} as const;

export type StatusColor = keyof typeof STATUS_COLORS;
