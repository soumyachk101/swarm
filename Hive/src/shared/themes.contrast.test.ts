import { describe, it, expect } from "vitest";
import { THEMES, type ThemeTokens } from "./themes";

/** Relative luminance per WCAG 2.1, from an "R G B" channel triplet. */
function luminance(triplet: string): number {
  const [r, g, b] = triplet.split(/\s+/).map((n) => {
    const c = Number(n) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Every one of these renders as small text somewhere: labels, counts, status
// lines. Small text is AA 4.5:1, not the 3:1 large-text allowance.
const FOREGROUNDS: (keyof ThemeTokens)[] = [
  "text",
  "textDim",
  "textMuted",
  "gold",
  "ok",
  "warn",
  "err",
];

// Brand marks that render in the vendor's own colour rather than the theme's.
// Near-black marks are excluded: BrandGlyph swaps those for currentColor,
// which the token checks above already cover.
const BRAND_MARKS: Record<string, string> = {
  Claude: "D97757",
  OpenAI: "FFFFFF",
  PowerShell: "5391FE",
  "Command Prompt": "C7C7C7",
  "GNU Bash": "4EAA25",
  Linux: "FCC624",
};

const hexToTriplet = (hex: string) =>
  [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

describe("theme token contrast", () => {
  for (const theme of THEMES) {
    for (const key of FOREGROUNDS) {
      it(`${theme.id}: ${key} on surface meets WCAG AA`, () => {
        const ratio = contrast(theme.tokens[key], theme.tokens.surface);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }

    // Panels sit on canvas as often as on surface; muted text must survive both.
    it(`${theme.id}: textMuted on canvas meets WCAG AA`, () => {
      const ratio = contrast(theme.tokens.textMuted, theme.tokens.canvas);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    // Icons are non-text content: WCAG 1.4.11 asks for 3:1, not 4.5:1.
    for (const [brand, hex] of Object.entries(BRAND_MARKS)) {
      it(`${theme.id}: ${brand} mark stays visible`, () => {
        const ratio = contrast(hexToTriplet(hex), theme.tokens.surface);
        expect(ratio).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
