import { describe, it, expect } from "vitest";
import { CLI_BRANDS, SHELL_BRANDS } from "./brands.js";
import { brandColor } from "./BrandGlyph.js";
import { AGENT_ICON_DATA } from "./agent-icon-data.js";

// The CLI catalogue in @swarm/agents. Duplicated as a literal on
// purpose: Board must not depend on Agents (the arrow points the other
// way), so this list is what keeps the two from drifting apart unnoticed.
const CLI_SLUGS = [
  "claude-code", "codex-cli", "aider", "antigravity-cli", "opencode",
  "kimi-code", "cline", "cursor", "kiro", "kilo",
];
const SHELL_IDS = ["powershell", "cmd", "git-bash", "wsl"];

describe("brand icons", () => {
  it("covers every CLI in the catalogue", () => {
    for (const slug of CLI_SLUGS) expect(CLI_BRANDS[slug], slug).toBeDefined();
  });

  it("covers every shell the terminal can launch", () => {
    for (const id of SHELL_IDS) expect(SHELL_BRANDS[id], id).toBeDefined();
  });

  it("never falls back to a stock glyph: each entry names a real source", () => {
    for (const [id, b] of Object.entries({ ...CLI_BRANDS, ...SHELL_BRANDS })) {
      if (b.kind === "vector") expect(b.path.length, id).toBeGreaterThan(20);
      if (b.kind === "raster") expect(AGENT_ICON_DATA[b.asset], id).toMatch(/^data:image\/png;base64,/);
      if (b.kind === "letter") expect(b.text.length, id).toBeLessThanOrEqual(2);
    }
  });

  it("swaps near-black marks for the theme colour, since every theme is dark", () => {
    // Cursor, OpenCode, Kimi and Cline all publish a black glyph.
    expect(brandColor("#000000")).toBe("currentColor");
    expect(brandColor("#18181B")).toBe("currentColor");
    // Anything legible keeps its own brand colour.
    expect(brandColor("#D97757")).toBe("#D97757");
    expect(brandColor("#FCC624")).toBe("#FCC624");
  });
});
