/**
 * The agent toolbox: the skills and MCP servers that every agent in a
 * agent gets, Agents and Lead alike.
 *
 * The delivery mechanism is the folder itself. Every agent in a agent is
 * spawned with its cwd inside that agent, and every CLI worth using reads
 * `.mcp.json` and `.claude/skills/` from its working directory. So a toolbox
 * is applied by writing those two things once per tree, and every present and
 * future agent in that tree picks them up with no per-agent wiring at all.
 *
 * The IO lives in `toolboxIO.ts`; everything here is pure so it can be tested
 * without a filesystem.
 */

export interface McpServerSpec {
  id: string;
  /** Key under `mcpServers` in .mcp.json. */
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface SkillSpec {
  id: string;
  /** Folder name under `.claude/skills`. */
  name: string;
  description: string;
  /** Where it was imported from, so it can be refreshed or reinstalled. */
  sourcePath: string;
  enabled: boolean;
}

export interface Toolbox {
  mcpServers: McpServerSpec[];
  skills: SkillSpec[];
}

export const EMPTY_TOOLBOX: Toolbox = { mcpServers: [], skills: [] };

/** A folder name safe to create on every platform, derived from a title. */
export function skillFolderName(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "skill";
}

/**
 * Merge the toolbox's servers into an existing `.mcp.json`.
 *
 * Servers already in the file that the toolbox does not manage are left alone:
 * Pheromone writes itself in there, and a user may have added their own by hand.
 * Disabled toolbox servers are removed rather than written with a flag, because
 * "enabled" is not part of the .mcp.json format and CLIs would just start them.
 */
export function mergeMcpJson(existing: string | null, toolbox: Toolbox): string {
  let root: Record<string, unknown> = {};
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) root = parsed;
    } catch {
      // A corrupt file is not a reason to lose the toolbox; start clean.
    }
  }

  const servers: Record<string, unknown> =
    root.mcpServers && typeof root.mcpServers === "object" && !Array.isArray(root.mcpServers)
      ? { ...(root.mcpServers as Record<string, unknown>) }
      : {};

  for (const s of toolbox.mcpServers) {
    if (!s.enabled) {
      delete servers[s.name];
      continue;
    }
    servers[s.name] = {
      command: s.command,
      args: s.args,
      ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}),
    };
  }

  return JSON.stringify({ ...root, mcpServers: servers }, null, 2);
}

/** Server names a CLI should be told to trust: everything in the merged file. */
export function serverNamesIn(mcpJson: string | null): string[] {
  if (!mcpJson) return [];
  try {
    const parsed = JSON.parse(mcpJson);
    const servers = parsed?.mcpServers;
    return servers && typeof servers === "object" ? Object.keys(servers) : [];
  } catch {
    return [];
  }
}

/**
 * Every directory a toolbox must be written into for one agent: the bound
 * folder plus each worktree, because an agent in a worktree has that worktree
 * as its cwd and would otherwise see none of it.
 */
export function toolboxTargets(
  boundProjectPath: string | undefined,
  worktrees: { path?: string }[] | undefined,
): string[] {
  const out: string[] = [];
  if (boundProjectPath) out.push(boundProjectPath);
  for (const t of worktrees ?? []) {
    if (t.path && !out.includes(t.path)) out.push(t.path);
  }
  return out;
}

/** Parse a skill's SKILL.md front matter for its name and description. */
export function parseSkillMeta(markdown: string): { name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^(name|description):\s*(.+)$/.exec(line.trim());
    if (kv) out[kv[1] as "name" | "description"] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
