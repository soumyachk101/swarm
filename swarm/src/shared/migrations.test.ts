import { describe, it, expect } from "vitest";
import { migrateThemeState } from "./themeStore";
import { migratePlaneState } from "@/features/panes/planeStore";
import { THEMES, DEFAULT_THEME_ID } from "./themes";

/**
 * These run against state written by a SHIPPED build. Getting them wrong does
 * not throw — it silently strands an existing install on a dead theme id or a
 * plane that no longer exists, which is the worst kind of bug to find later.
 */

describe("theme migration (8 themes -> 3)", () => {
  it("rewrites a theme that no longer exists", () => {
    for (const dead of ["hive", "claude", "neon", "midnight", "forest", "rose", "slate", "dracula"]) {
      expect(migrateThemeState({ themeId: dead }).themeId).toBe(DEFAULT_THEME_ID);
    }
  });

  it("keeps a theme that survived the cut", () => {
    for (const t of THEMES) {
      expect(migrateThemeState({ themeId: t.id }).themeId).toBe(t.id);
    }
  });

  it("handles missing, empty and malformed state", () => {
    expect(migrateThemeState(undefined).themeId).toBe(DEFAULT_THEME_ID);
    expect(migrateThemeState({}).themeId).toBe(DEFAULT_THEME_ID);
    expect(migrateThemeState({ themeId: "" }).themeId).toBe(DEFAULT_THEME_ID);
  });

  it("never returns an id the app cannot render", () => {
    const ids = THEMES.map((t) => t.id);
    for (const input of [undefined, {}, { themeId: "nonsense" }, { themeId: "graphite" }]) {
      expect(ids).toContain(migrateThemeState(input).themeId);
    }
  });
});

describe("plane migration (honeyflow -> honeyboard -> board)", () => {
  it("renames the old board plane, from either past name", () => {
    expect(migratePlaneState({ active: "honeyflow", view: "board" }).active).toBe("board");
    expect(migratePlaneState({ active: "honeyboard", view: "board" }).active).toBe("board");
  });

  it("leaves the other planes alone", () => {
    expect(migratePlaneState({ active: "browser" }).active).toBe("browser");
    expect(migratePlaneState({ active: "emulator" }).active).toBe("emulator");
  });

  it("falls back to the board for anything unrecognised", () => {
    expect(migratePlaneState({ active: "wat" }).active).toBe("board");
    expect(migratePlaneState(undefined).active).toBe("board");
  });

  it("preserves a saved flow view but defaults anything else to board", () => {
    expect(migratePlaneState({ view: "flow" }).view).toBe("flow");
    expect(migratePlaneState({ view: "board" }).view).toBe("board");
    // "flow" did not exist before this version; absent means board.
    expect(migratePlaneState({}).view).toBe("board");
    expect(migratePlaneState({ view: "grid" }).view).toBe("board");
  });
});
