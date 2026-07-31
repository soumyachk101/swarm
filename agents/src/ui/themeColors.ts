/**
 * Live theme colors from CSS tokens set by Swarm's ThemePicker.
 * Agents stays package-standalone — it only reads document CSS vars.
 */

export const THEME_CHANGE_EVENT = "swarm:themechange";

const FALLBACKS: Record<string, string> = {
  "--swarm-canvas": "20 16 14",
  "--swarm-canvas-hi": "28 22 19",
  "--swarm-surface": "36 31 28",
  "--swarm-border": "61 46 31",
  "--swarm-gold": "201 162 39",
  "--swarm-gold-hi": "212 184 74",
  "--swarm-gold-dim": "154 114 6",
  "--swarm-honey": "232 197 71",
  "--swarm-amber": "184 134 11",
  "--swarm-text": "245 240 230",
  "--swarm-text-dim": "201 184 150",
  "--swarm-text-muted": "138 123 92",
  "--swarm-ok": "143 174 122",
  "--swarm-warn": "208 164 63",
  "--swarm-err": "198 107 90",
};

function readChannels(cssVar: string): string {
  if (typeof document === "undefined") return FALLBACKS[cssVar] ?? "0 0 0";
  const live = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return live || FALLBACKS[cssVar] || "0 0 0";
}

export function rgbChannelsToHex(channels: string): string {
  const parts = channels.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return "#000000";
  const [r, g, b] = parts.map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export function swarmHex(cssVar: string): string {
  return rgbChannelsToHex(readChannels(cssVar));
}

export function swarmRgb(cssVar: string, alpha?: number): string {
  const ch = readChannels(cssVar);
  return alpha === undefined ? `rgb(${ch})` : `rgb(${ch} / ${alpha})`;
}

/**
 * ANSI is a contract, not decoration. Programs emit "red" for errors, "green"
 * for additions and "yellow" for a shell's own syntax highlighting, and they
 * expect those to look like the colours they name. Mapping them onto brand
 * tokens turned every one of them into honey-gold — which is why a typed
 * PowerShell command (PSReadLine paints commands yellow) came out orange.
 *
 * So the 16 ANSI slots are a fixed, balanced dark palette. Only the parts that
 * are genuinely the app's — surface, default text, cursor, selection — follow
 * the active theme, which keeps the pane looking like Swarm without lying
 * about what a program printed.
 */
const ANSI = {
  black: "#1e222a",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#dcdfe4",
  brightBlack: "#5c6370",
  brightRed: "#ef7a85",
  brightGreen: "#a9d67f",
  brightYellow: "#f0ce93",
  brightBlue: "#74bdff",
  brightMagenta: "#d191e6",
  brightCyan: "#6ecad3",
  brightWhite: "#ffffff",
} as const;

/** xterm ITheme: app chrome from the live tokens, ANSI slots fixed. */
export function buildXtermThemeFromDom(): Record<string, string> {
  return {
    // Opaque, matching the pane's own content background. This used to be
    // transparent so the glass would show through — but a pane already paints
    // an opaque `--swarm-canvas-hi` fill behind its terminal, so nothing ever
    // showed through; all the transparency bought was xterm's slow alpha path
    // and a hard block on the WebGL renderer (which cannot honour it). Opaque
    // here is what lets the panes run on the GPU with crisp glyphs.
    background: swarmHex("--swarm-canvas-hi"),
    foreground: swarmHex("--swarm-text"),
    cursor: swarmHex("--swarm-gold"),
    cursorAccent: swarmHex("--swarm-canvas"),
    selectionBackground: swarmRgb("--swarm-gold", 0.28),
    selectionForeground: swarmHex("--swarm-text"),
    ...ANSI,
  };
}
