/**
 * Live theme colors from CSS tokens set by Hive's ThemePicker.
 * WorkerBees stays package-standalone — it only reads document CSS vars.
 */

export const THEME_CHANGE_EVENT = "hiveory:themechange";

const FALLBACKS: Record<string, string> = {
  "--bee-canvas": "20 16 14",
  "--bee-canvas-hi": "28 22 19",
  "--bee-surface": "36 31 28",
  "--bee-border": "61 46 31",
  "--bee-gold": "201 162 39",
  "--bee-gold-hi": "212 184 74",
  "--bee-gold-dim": "154 114 6",
  "--bee-honey": "232 197 71",
  "--bee-amber": "184 134 11",
  "--bee-text": "245 240 230",
  "--bee-text-dim": "201 184 150",
  "--bee-text-muted": "138 123 92",
  "--bee-ok": "143 174 122",
  "--bee-warn": "208 164 63",
  "--bee-err": "198 107 90",
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

export function beeHex(cssVar: string): string {
  return rgbChannelsToHex(readChannels(cssVar));
}

export function beeRgb(cssVar: string, alpha?: number): string {
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
 * the active theme, which keeps the pane looking like Hiveory without lying
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
    // Transparent: the pane behind supplies the glass. xterm painting its own
    // opaque fill here is what made every terminal a solid rectangle sitting on
    // top of the glass instead of part of it.
    background: "#00000000",
    foreground: beeHex("--bee-text"),
    cursor: beeHex("--bee-gold"),
    cursorAccent: beeHex("--bee-canvas"),
    selectionBackground: beeRgb("--bee-gold", 0.28),
    selectionForeground: beeHex("--bee-text"),
    ...ANSI,
  };
}
