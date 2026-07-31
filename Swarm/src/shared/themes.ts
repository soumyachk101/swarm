/** Color themes — only CSS token values change; layout/components stay the same. */

export type ThemeId = "graphite" | "obsidian" | "amber";

export interface ThemeTokens {
  /** Space-separated RGB channels, e.g. "224 168 58" — used with rgb(var(--x) / a). */
  canvas: string;
  canvasHi: string;
  surface: string;
  surfaceHi: string;
  border: string;
  borderHi: string;
  gold: string;
  goldHi: string;
  goldDim: string;
  honey: string;
  amber: string;
  text: string;
  textDim: string;
  textMuted: string;
  ok: string;
  warn: string;
  err: string;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
  /** Swatch colors shown in the picker (accent, surface, canvas). */
  swatch: [string, string, string];
  tokens: ThemeTokens;
}

/**
 * Three themes, not eight. Eight meant eight half-tuned palettes; three means
 * each one is a deliberate, verified position:
 *
 *   Graphite - neutral cool grey, amber signal. The default working surface:
 *              nothing in the chrome competes with syntax colour in a terminal.
 *   Obsidian - near-black, cold blue signal. Maximum focus and least emitted
 *              light, for long sessions and OLED panels.
 *   Amber    - the warm swarm identity, held back so it stays a workplace.
 *
 * Every foreground token is verified against BOTH surface and canvas at WCAG
 * AA, and control edges (borderHi) at the 3:1 the spec asks of non-text UI.
 * `themes.contrast.test.ts` fails the build if a future edit breaks that.
 */

const GRAPHITE: ThemeTokens = {
  canvas: "14 16 19",
  canvasHi: "20 23 28",
  surface: "25 29 35",
  surfaceHi: "33 39 48",
  border: "44 51 61",
  borderHi: "97 105 114",
  gold: "224 168 58",
  goldHi: "240 195 104",
  goldDim: "169 122 37",
  honey: "240 195 104",
  amber: "208 146 47",
  text: "238 241 245",
  textDim: "179 189 201",
  textMuted: "125 136 150",
  ok: "79 178 134",
  warn: "216 161 60",
  err: "224 100 94",
};

const OBSIDIAN: ThemeTokens = {
  canvas: "8 9 12",
  canvasHi: "13 15 20",
  surface: "18 21 27",
  surfaceHi: "25 29 37",
  border: "36 41 51",
  borderHi: "93 99 108",
  gold: "91 157 250",
  goldHi: "138 184 252",
  goldDim: "63 116 196",
  honey: "138 184 252",
  amber: "79 143 232",
  text: "240 243 248",
  textDim: "182 192 207",
  textMuted: "124 135 152",
  ok: "72 185 138",
  warn: "219 163 65",
  err: "226 102 95",
};

const AMBER: ThemeTokens = {
  canvas: "18 16 12",
  canvasHi: "24 21 16",
  surface: "31 27 21",
  surfaceHi: "40 35 27",
  border: "55 47 35",
  borderHi: "110 102 90",
  gold: "232 176 74",
  goldHi: "246 205 124",
  goldDim: "172 127 44",
  honey: "242 192 99",
  amber: "213 154 53",
  text: "244 239 228",
  textDim: "200 189 168",
  textMuted: "142 132 113",
  ok: "99 171 116",
  warn: "223 174 76",
  err: "221 106 92",
};

export const THEMES: ThemeDef[] = [
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral graphite with an amber signal",
    swatch: ["#e0a83a", "#191d23", "#0e1013"],
    tokens: GRAPHITE,
  },
  {
    id: "obsidian",
    label: "Obsidian",
    description: "Near-black with a cold blue signal",
    swatch: ["#5b9dfa", "#12151b", "#08090c"],
    tokens: OBSIDIAN,
  },
  {
    id: "amber",
    label: "Amber",
    description: "The warm swarm, kept restrained",
    swatch: ["#e8b04a", "#1f1b15", "#12100c"],
    tokens: AMBER,
  },
];

export const THEME_BY_ID: Record<ThemeId, ThemeDef> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
) as Record<ThemeId, ThemeDef>;

export const DEFAULT_THEME_ID: ThemeId = "graphite";

const TOKEN_TO_CSS: Record<keyof ThemeTokens, string> = {
  canvas: "--swarm-canvas",
  canvasHi: "--swarm-canvas-hi",
  surface: "--swarm-surface",
  surfaceHi: "--swarm-surface-hi",
  border: "--swarm-border",
  borderHi: "--swarm-border-hi",
  gold: "--swarm-gold",
  goldHi: "--swarm-gold-hi",
  goldDim: "--swarm-gold-dim",
  honey: "--swarm-honey",
  amber: "--swarm-amber",
  text: "--swarm-text",
  textDim: "--swarm-text-dim",
  textMuted: "--swarm-text-muted",
  ok: "--swarm-ok",
  warn: "--swarm-warn",
  err: "--swarm-err",
};

/** Fired on `window` after CSS tokens are written so non-CSS surfaces (xterm) can refresh. */
export const THEME_CHANGE_EVENT = "swarm:themechange";

/** Convert `"201 162 39"` channel triplets to `#c9a227`. */
export function rgbChannelsToHex(channels: string): string {
  const parts = channels.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return "#000000";
  const [r, g, b] = parts.map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Accent hex for the active (or given) theme — agent chips, defaults, etc. */
export function themeAccentHex(id?: ThemeId): string {
  const theme = THEME_BY_ID[id ?? DEFAULT_THEME_ID] ?? THEME_BY_ID[DEFAULT_THEME_ID];
  return rgbChannelsToHex(theme.tokens.gold);
}

/** Apply theme CSS variables on :root / documentElement. */
export function applyTheme(id: ThemeId): void {
  const theme = THEME_BY_ID[id] ?? THEME_BY_ID[DEFAULT_THEME_ID];
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  for (const [key, cssVar] of Object.entries(TOKEN_TO_CSS) as [keyof ThemeTokens, string][]) {
    const channels = theme.tokens[key];
    root.style.setProperty(cssVar, channels);
    // Hex mirrors for JS/SVG that can't use channel triplets (xterm, stroke, etc.)
    root.style.setProperty(`${cssVar}-hex`, rgbChannelsToHex(channels));
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { id: theme.id } }));
  }
}
