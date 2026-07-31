import { invoke } from "@tauri-apps/api/core";

/**
 * Pre-accept Claude Code's "Quick safety check / trust this folder" dialog by
 * writing `hasTrustDialogAccepted: true` into `~/.claude.json` for the spawn
 * cwd (and home, so ancestor walk covers subfolders).
 *
 * `--dangerously-skip-permissions` does NOT skip this dialog (Claude Code bug /
 * intentional boundary). Path keys are written in both `C:\...` and `C:/...`
 * forms because Windows lookups are inconsistent across Claude versions.
 */
export async function ensureClaudeWorkspaceTrust(cwd: string): Promise<void> {
  const home = await invoke<string>("get_home_dir");
  const claudeJsonPath = joinPath(home, ".claude.json");

  let existing: string | null = null;
  try {
    existing = await invoke<string>("read_file", { path: claudeJsonPath });
  } catch {
    existing = null;
  }

  const next = mergeClaudeTrust(existing, [cwd, home]);
  await invoke("write_file", { path: claudeJsonPath, content: next });
  console.log(`[Pheromone] Claude agent trust pre-accepted for: ${cwd}`);
}

/** Pure merge — exported for tests. */
export function mergeClaudeTrust(existingRaw: string | null, dirs: string[]): string {
  let root: Record<string, unknown> = {};
  if (existingRaw) {
    try {
      root = JSON.parse(existingRaw);
    } catch {
      root = {};
    }
  }

  const projects =
    root.projects && typeof root.projects === "object" && !Array.isArray(root.projects)
      ? (root.projects as Record<string, Record<string, unknown>>)
      : {};

  for (const dir of dirs) {
    if (!dir) continue;
    for (const key of pathKeys(dir)) {
      const prev = projects[key] && typeof projects[key] === "object" ? projects[key] : {};
      projects[key] = { ...prev, hasTrustDialogAccepted: true };
    }
  }

  root.projects = projects;
  return JSON.stringify(root, null, 2);
}

function pathKeys(dir: string): string[] {
  const trimmed = dir.replace(/[\\/]+$/, "");
  const fwd = trimmed.replace(/\\/g, "/");
  const back = trimmed.replace(/\//g, "\\");
  return Array.from(new Set([trimmed, fwd, back]));
}

function joinPath(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") ? "\\" : "/";
  return [base.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/**
 * Best-effort trust / auto-approve setup for every Agent CLI before spawn.
 * Claude is the one with the hard agent-trust dialog; others get a no-op
 * or light config touch as we discover equivalents.
 */
export async function ensureCliWorkspaceTrust(cli: string, cwd: string): Promise<void> {
  if (!cwd) return;
  try {
    switch (cli) {
      case "claude":
        await ensureClaudeWorkspaceTrust(cwd);
        break;
      default:
        // Codex / OpenCode / Aider don't have an equivalent blocking folder-trust UI.
        break;
    }
  } catch (e) {
    console.warn(`[Pheromone] Workspace trust setup failed for ${cli}:`, e);
  }
}
