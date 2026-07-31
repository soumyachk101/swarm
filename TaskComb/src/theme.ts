/**
 * Board colours — semantic status mapped to live theme tokens so ThemePicker
 * recolors TaskComb boards with the rest of the app.
 */
export const STATUS_COLORS = {
  /** Nothing has happened yet — muted text. */
  idle: "rgb(var(--bee-text-muted))",
  /** Queued or waiting — dim text (cool "blade" feel without a fixed hex). */
  queued: "rgb(var(--bee-text-dim))",
  /** Working right now — theme accent. */
  active: "rgb(var(--bee-gold))",
  /** Awaiting a human — secondary accent. */
  review: "rgb(var(--bee-honey))",
  /** Finished well. */
  done: "rgb(var(--bee-ok))",
  /** Broken or blocked. */
  failed: "rgb(var(--bee-err))",
} as const;

export type StatusColor = keyof typeof STATUS_COLORS;
