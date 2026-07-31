import { describe, it, expect } from "vitest";
import {
  excerptForHandoff,
  looksLikeTerminalGarbage,
  stripTerminalNoise,
} from "./sanitizeHandoff.js";
import { mergeClaudeTrust } from "./ensureWorkspaceTrust.js";

describe("sanitizeHandoff", () => {
  it("strips ANSI and TUI glyphs", () => {
    const raw = "\u001b[38;5;178mhello\u001b[0m \u28FF\u2591 world";
    expect(stripTerminalNoise(raw)).toBe("hello world");
  });

  it("detects glued Ink chrome as garbage", () => {
    const junk =
      "forshortcutsGemini3.5Flash-low AntigravityCLI1.1.5 forshortcutsGemini3.5Flash-low bypass permissions on";
    expect(looksLikeTerminalGarbage(junk)).toBe(true);
  });

  it("keeps readable session notes", () => {
    const ok = "Fixed the auth middleware bug. Next: add unit tests for token refresh.";
    expect(looksLikeTerminalGarbage(ok)).toBe(false);
    expect(excerptForHandoff(ok)).toContain("auth middleware");
  });

  it("drops garbage excerpts entirely", () => {
    const junk = "forshortcutsGemini3.5Flash-low\nAntigravityCLI1.1.5raktim\nforshortcutsGemini";
    expect(excerptForHandoff(junk)).toBe("");
  });
});

describe("mergeClaudeTrust", () => {
  it("sets hasTrustDialogAccepted for slash and backslash keys", () => {
    const out = JSON.parse(
      mergeClaudeTrust(null, ["C:\\Users\\rakti\\Desktop\\code\\Normal\\prg-test"]),
    );
    expect(out.projects["C:/Users/rakti/Desktop/code/Normal/prg-test"].hasTrustDialogAccepted).toBe(true);
    expect(out.projects["C:\\Users\\rakti\\Desktop\\code\\Normal\\prg-test"].hasTrustDialogAccepted).toBe(true);
  });

  it("preserves existing project fields", () => {
    const prev = JSON.stringify({
      projects: {
        "C:/foo": { hasTrustDialogAccepted: false, projectOnboardingSeenCount: 3 },
      },
    });
    const out = JSON.parse(mergeClaudeTrust(prev, ["C:/foo"]));
    expect(out.projects["C:/foo"].hasTrustDialogAccepted).toBe(true);
    expect(out.projects["C:/foo"].projectOnboardingSeenCount).toBe(3);
  });
});
