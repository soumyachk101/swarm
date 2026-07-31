import { describe, it, expect } from "vitest";
import { modelArgs, supportsEffort, supportsModel } from "./model-args.js";

// Flags here were read off each CLI's own --help. These tests exist so a
// refactor can't quietly start handing a binary a flag it will reject.
describe("modelArgs", () => {
  it("turns 'Claude Code, opus, medium effort' into real flags", () => {
    expect(modelArgs("claude", "opus", "medium")).toEqual([
      "--model", "opus", "--effort", "medium",
    ]);
  });

  it("accepts how people actually say it — 'Opus 5'", () => {
    // The alias already means the latest Opus, so the version is dropped.
    expect(modelArgs("claude", "Opus 5")).toEqual(["--model", "opus"]);
    expect(modelArgs("claude", "sonnet-4.5")).toEqual(["--model", "sonnet"]);
  });

  it("keeps a full model name untouched", () => {
    expect(modelArgs("claude", "claude-opus-5-20260101")).toEqual([
      "--model", "claude-opus-5-20260101",
    ]);
  });

  it("puts Codex effort on a config override, not a flag it lacks", () => {
    expect(modelArgs("codex", "gpt-5", "high")).toEqual([
      "--model", "gpt-5", "-c", 'model_reasoning_effort="high"',
    ]);
  });

  it("clamps effort levels Codex does not have", () => {
    expect(modelArgs("codex", undefined, "max")).toEqual([
      "-c", 'model_reasoning_effort="high"',
    ]);
  });

  it("passes OpenCode's provider/model form straight through", () => {
    expect(modelArgs("opencode", "anthropic/claude-opus-5")).toEqual([
      "--model", "anthropic/claude-opus-5",
    ]);
  });

  it("ignores effort for CLIs that have no such concept", () => {
    expect(modelArgs("opencode", undefined, "high")).toEqual([]);
    expect(modelArgs("aider", "gpt-4o", "high")).toEqual(["--model", "gpt-4o"]);
  });

  it("hands nothing to a CLI with no published flags", () => {
    expect(modelArgs("agy", "whatever", "high")).toEqual([]);
    expect(modelArgs("kimi", "whatever")).toEqual([]);
  });

  it("drops an effort level that isn't real", () => {
    expect(modelArgs("claude", "opus", "ludicrous")).toEqual(["--model", "opus"]);
  });

  it("returns nothing when nothing was asked for", () => {
    expect(modelArgs("claude")).toEqual([]);
    expect(modelArgs("claude", "  ", "  ")).toEqual([]);
  });

  it("reports capabilities honestly", () => {
    expect(supportsModel("claude")).toBe(true);
    expect(supportsEffort("claude")).toBe(true);
    expect(supportsEffort("opencode")).toBe(false);
    expect(supportsModel("agy")).toBe(false);
  });
});
