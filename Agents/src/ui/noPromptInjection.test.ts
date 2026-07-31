import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MCP_CAPABLE_CLIS } from "../cli-configs/index.js";

// Swarm must never type text into an agent's prompt. A pasted charter or
// memory blob is noise the user has to clear by hand (and it burns a turn), so
// context travels over MCP and the crown's charter lives in a file.
//
// This guards the source itself: the only writeToProcess calls left in the pane
// are the user's own keystrokes and Ctrl+C.
const PANE = readFileSync(join(__dirname, "AgentPane.tsx"), "utf8");

describe("no prompt injection", () => {
  it("never sends a Lead charter into a CLI", () => {
    expect(PANE).not.toMatch(/MODE_SYSTEM_PROMPTS/);
    expect(PANE).not.toMatch(/leadCharter/);
  });

  it("keeps only keystrokes, SIGINT and the non-MCP memory pointer on stdin", () => {
    const calls = [...PANE.matchAll(/writeToProcess\(([^\n]*)\)/g)].map((m) => m[1]);
    expect(calls).toEqual([
      'flattenForStdin(ctxLine) + "\\n"', // non-MCP CLIs only, guarded below
      '"\\x03"', // Ctrl+C
      "data", // the user's own typing
    ]);
  });

  it("guards that pointer behind a bail-out for every MCP-capable CLI", () => {
    const guard = PANE.indexOf("MCP_CAPABLE_CLIS.includes(agent.cli)");
    const inject = PANE.indexOf("writeToProcess(flattenForStdin(ctxLine)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(inject);
    // Claude Code and the other agent CLIs must be in that list.
    expect(MCP_CAPABLE_CLIS).toContain("claude");
  });
});
