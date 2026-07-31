import { invoke } from "@tauri-apps/api/core";
import {
  mergeMcpJson,
  parseSkillMeta,
  serverNamesIn,
  skillFolderName,
  toolboxTargets,
  type SkillSpec,
  type Toolbox,
} from "./toolbox.js";

const join = (...parts: string[]) => parts.filter(Boolean).join("/");

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await invoke<string>("read_file", { path });
  } catch {
    return null;
  }
}

/**
 * Write one agent's toolbox into one directory: `.mcp.json` for the servers,
 * `.claude/skills/<name>/` for the skills, and Claude's local settings so the
 * servers are pre-approved instead of prompting each agent on first use.
 */
export async function applyToolboxTo(dir: string, toolbox: Toolbox): Promise<void> {
  const mcpPath = join(dir, ".mcp.json");
  const merged = mergeMcpJson(await readOrNull(mcpPath), toolbox);
  await invoke("write_file", { path: mcpPath, content: merged });

  // Claude Code will not start a project server it has not been told to trust,
  // so the approval list is kept in step with the file we just wrote.
  const names = serverNamesIn(merged);
  const settingsPath = join(dir, ".claude", "settings.local.json");
  await invoke("ensure_dir", { path: join(dir, ".claude") });
  const settingsRaw = await readOrNull(settingsPath);
  let settings: Record<string, unknown> = {};
  try {
    if (settingsRaw) settings = JSON.parse(settingsRaw) ?? {};
  } catch {
    settings = {};
  }
  await invoke("write_file", {
    path: settingsPath,
    content: JSON.stringify({ ...settings, enabledMcpjsonServers: names }, null, 2),
  });

  const skillsRoot = join(dir, ".claude", "skills");
  for (const skill of toolbox.skills) {
    const dest = join(skillsRoot, skill.name);
    if (!skill.enabled) {
      await invoke("remove_dir", { path: dest }).catch(() => {});
      continue;
    }
    if (!skill.sourcePath) continue;
    // Replace rather than merge: a stale file left behind from an older version
    // of the skill is worse than a slightly slower copy.
    await invoke("remove_dir", { path: dest }).catch(() => {});
    await invoke("copy_dir", { from: skill.sourcePath, to: dest });
  }
}

/**
 * Apply a toolbox everywhere the agent's agents actually run: the bound
 * folder and every worktree.
 */
export async function applyToolbox(
  boundProjectPath: string | undefined,
  worktrees: { path?: string }[] | undefined,
  toolbox: Toolbox,
): Promise<string[]> {
  const targets = toolboxTargets(boundProjectPath, worktrees);
  const done: string[] = [];
  for (const dir of targets) {
    try {
      await applyToolboxTo(dir, toolbox);
      done.push(dir);
    } catch (e) {
      console.warn(`[Toolbox] could not apply to ${dir}:`, e);
    }
  }
  return done;
}

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
}

/**
 * Skills already installed for the user, so the picker offers what they have
 * rather than asking them to remember paths. Reads `~/.claude/skills`, the
 * location Claude Code itself uses.
 */
export async function discoverInstalledSkills(): Promise<SkillSpec[]> {
  let home: string;
  try {
    home = await invoke<string>("get_home_dir");
  } catch {
    return [];
  }
  const root = join(home, ".claude", "skills");
  let entries: DirEntry[] = [];
  try {
    entries = await invoke<DirEntry[]>("list_directory", { path: root });
  } catch {
    return [];
  }

  const found: SkillSpec[] = [];
  for (const entry of entries) {
    if (!entry.is_dir) continue;
    const md = await readOrNull(join(entry.path, "SKILL.md"));
    if (md === null) continue; // a folder without a SKILL.md is not a skill
    const meta = parseSkillMeta(md);
    found.push({
      id: `skill-${entry.name}`,
      name: skillFolderName(meta.name ?? entry.name),
      description: meta.description ?? "",
      sourcePath: entry.path,
      enabled: false,
    });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** Read a skill folder the user picked by hand. */
export async function skillFromFolder(path: string): Promise<SkillSpec | null> {
  const md = await readOrNull(join(path, "SKILL.md"));
  if (md === null) return null;
  const meta = parseSkillMeta(md);
  const fallback = path.split(/[\\/]/).filter(Boolean).pop() ?? "skill";
  return {
    id: `skill-${Date.now()}`,
    name: skillFolderName(meta.name ?? fallback),
    description: meta.description ?? "",
    sourcePath: path,
    enabled: true,
  };
}
