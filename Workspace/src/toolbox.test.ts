import { describe, it, expect } from "vitest";
import {
  EMPTY_TOOLBOX,
  mergeMcpJson,
  parseSkillMeta,
  serverNamesIn,
  skillFolderName,
  toolboxTargets,
  type Toolbox,
} from "./toolbox.js";

const server = (name: string, enabled = true) => ({
  id: name, name, command: "npx", args: ["-y", name], enabled,
});

describe("mergeMcpJson", () => {
  it("writes enabled servers in the shape a CLI expects", () => {
    const out = JSON.parse(mergeMcpJson(null, { ...EMPTY_TOOLBOX, mcpServers: [server("playwright")] }));
    expect(out.mcpServers.playwright).toEqual({ command: "npx", args: ["-y", "playwright"] });
  });

  it("keeps servers it does not manage", () => {
    // Pheromone writes itself into this file; the toolbox must not evict it.
    const existing = JSON.stringify({ mcpServers: { pheromone: { command: "node", args: ["server.js"] } } });
    const out = JSON.parse(mergeMcpJson(existing, { ...EMPTY_TOOLBOX, mcpServers: [server("playwright")] }));
    expect(Object.keys(out.mcpServers).sort()).toEqual(["pheromone", "playwright"]);
  });

  it("preserves unrelated top-level keys", () => {
    const out = JSON.parse(mergeMcpJson(JSON.stringify({ $schema: "x", mcpServers: {} }), EMPTY_TOOLBOX));
    expect(out.$schema).toBe("x");
  });

  it("removes a disabled server rather than writing a flag the format lacks", () => {
    const existing = JSON.stringify({ mcpServers: { playwright: { command: "npx", args: [] } } });
    const out = JSON.parse(mergeMcpJson(existing, {
      ...EMPTY_TOOLBOX, mcpServers: [server("playwright", false)],
    }));
    expect(out.mcpServers.playwright).toBeUndefined();
  });

  it("includes env only when there is some", () => {
    const withEnv: Toolbox = {
      ...EMPTY_TOOLBOX,
      mcpServers: [{ ...server("a"), env: { KEY: "v" } }, { ...server("b"), env: {} }],
    };
    const out = JSON.parse(mergeMcpJson(null, withEnv));
    expect(out.mcpServers.a.env).toEqual({ KEY: "v" });
    expect(out.mcpServers.b.env).toBeUndefined();
  });

  it("survives a corrupt file instead of throwing the toolbox away", () => {
    const out = JSON.parse(mergeMcpJson("{ not json", { ...EMPTY_TOOLBOX, mcpServers: [server("a")] }));
    expect(out.mcpServers.a).toBeDefined();
  });

  it("ignores a non-object mcpServers value", () => {
    const out = JSON.parse(mergeMcpJson(JSON.stringify({ mcpServers: [1, 2] }), {
      ...EMPTY_TOOLBOX, mcpServers: [server("a")],
    }));
    expect(Object.keys(out.mcpServers)).toEqual(["a"]);
  });
});

describe("serverNamesIn", () => {
  it("lists every server so all of them get approved", () => {
    expect(serverNamesIn(JSON.stringify({ mcpServers: { a: {}, b: {} } }))).toEqual(["a", "b"]);
  });
  it("is empty for missing or broken input", () => {
    expect(serverNamesIn(null)).toEqual([]);
    expect(serverNamesIn("nope")).toEqual([]);
  });
});

describe("toolboxTargets", () => {
  it("covers the bound folder and every worktree", () => {
    expect(toolboxTargets("C:/p", [{ path: "C:/p/.trees/a" }, { path: "C:/p/.trees/b" }]))
      .toEqual(["C:/p", "C:/p/.trees/a", "C:/p/.trees/b"]);
  });
  it("skips duplicates and empties", () => {
    expect(toolboxTargets("C:/p", [{ path: "C:/p" }, { path: undefined }])).toEqual(["C:/p"]);
  });
  it("is empty for an unbound agent", () => {
    expect(toolboxTargets(undefined, [])).toEqual([]);
  });
});

describe("skillFolderName", () => {
  it("slugifies to something creatable on every platform", () => {
    expect(skillFolderName("UI/UX Pro Max")).toBe("ui-ux-pro-max");
    expect(skillFolderName("  Deep Research!  ")).toBe("deep-research");
  });
  it("never returns an empty name", () => {
    expect(skillFolderName("///")).toBe("skill");
  });
});

describe("parseSkillMeta", () => {
  it("reads name and description out of front matter", () => {
    const md = "---\nname: graphify\ndescription: any input to a knowledge graph\n---\n\n# Body";
    expect(parseSkillMeta(md)).toEqual({ name: "graphify", description: "any input to a knowledge graph" });
  });
  it("strips quotes and handles CRLF", () => {
    expect(parseSkillMeta('---\r\nname: "x"\r\n---\r\n').name).toBe("x");
  });
  it("returns nothing when there is no front matter", () => {
    expect(parseSkillMeta("# Just a heading")).toEqual({});
  });
});
