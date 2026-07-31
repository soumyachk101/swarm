import { invoke } from "@tauri-apps/api/core";
import {
  buildCliConfig,
  MCP_CAPABLE_CLIS,
  claudeEnabledMcpServersFromMcpJson,
  claudeSettingsMergeWithServers,
} from "@swarm/agents/cli-configs";
import { ensureCliWorkspaceTrust } from "./ensureWorkspaceTrust.js";

// FLIP THIS to true to make Antigravity (`agy`) use the Pheromone MCP plugin path.
const ENABLE_ANTIGRAVITY_PLUGIN = true;

export type PheromoneBridge = "mcp" | "mcp-plugin" | "stdin-fallback";

/**
 * Write MCP server config so the CLI registers pheromone_query as a tool.
 * For Claude Code, also auto-approves every server in the project's `.mcp.json`
 * (pheromone + playwright + others) via `.claude/settings.local.json`.
 */
export async function ensureMCPConfigForCLI(
  cli: string,
  projectPath: string,
): Promise<PheromoneBridge> {
  let mcpServerPath: string;
  try {
    mcpServerPath = await invoke<string>("get_pheromone_mcp_path");
  } catch (e) {
    console.error(`[Pheromone] get_pheromone_mcp_path failed — cannot register MCP for ${cli}:`, e);
    throw e;
  }
  console.log(`[Pheromone] MCP server.js -> ${mcpServerPath} (cli=${cli}, project=${projectPath})`);
  const action = buildCliConfig(cli, { mcpServerPath, projectPath }, {
    enableAntigravityPlugin: ENABLE_ANTIGRAVITY_PLUGIN,
  });

  const writeMergedFile = async (
    path: string,
    merge: (existing: string | null) => string,
  ) => {
    const dir = path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));
    if (dir) await invoke("ensure_dir", { path: dir });
    let existing: string | null = null;
    try { existing = await invoke<string>("read_file", { path }); } catch { existing = null; }
    await invoke("write_file", { path, content: merge(existing) });
  };

  switch (action.kind) {
    case "noop":
      console.log(`[Pheromone] ${action.reason}`);
      return "stdin-fallback";

    case "writeFile": {
      await writeMergedFile(action.path, action.merge);
      console.log(`[Pheromone] Wrote MCP config for ${cli} -> ${action.path}`);
      return "mcp";
    }

    case "writeFiles": {
      for (const file of action.files) {
        await writeMergedFile(file.path, file.merge);
        console.log(`[Pheromone] Wrote config for ${cli} -> ${file.path}`);
      }
      if (cli === "claude") {
        const mcpPath = action.files[0]?.path;
        const settingsPath = action.files[1]?.path;
        if (mcpPath && settingsPath) {
          let mcpRaw: string | null = null;
          try { mcpRaw = await invoke<string>("read_file", { path: mcpPath }); } catch { mcpRaw = null; }
          const names = claudeEnabledMcpServersFromMcpJson(mcpRaw);
          await writeMergedFile(settingsPath, (existing) =>
            claudeSettingsMergeWithServers(existing, names),
          );
          console.log(`[Pheromone] Auto-approved project MCP servers: ${names.join(", ")}`);
        }
      }
      return "mcp";
    }

    case "runCommand":
      await invoke("run_command", { command: action.command, args: action.args });
      console.log(`[Pheromone] Registered MCP for ${cli} via: ${action.command} ${action.args.join(" ")}`);
      return "mcp";

    case "writePluginDir": {
      await invoke("ensure_dir", { path: action.pluginDir });
      for (const file of action.files) {
        await invoke("write_file", {
          path: `${action.pluginDir}/${file.relativePath}`,
          content: file.content,
        });
      }
      console.log(`[Pheromone] Wrote Antigravity plugin dir -> ${action.pluginDir}`);
      if (action.installCommand) {
        await invoke("run_command", {
          command: action.installCommand.command,
          args: action.installCommand.args,
        });
        console.log(
          `[Pheromone] Installed Antigravity plugin via: ${action.installCommand.command} ${action.installCommand.args.join(" ")}`,
        );
      }
      return "mcp-plugin";
    }
  }
}

/**
 * Pre-wire Pheromone MCP for every MCP-capable Agent CLI when a project opens,
 * so spawning Claude/Codex/OpenCode/… later already has pheromone in their configs.
 */
export async function ensurePheromoneMcpForProject(projectPath: string, defaultCli: string): Promise<void> {
  const clis = Array.from(
    new Set<string>([...MCP_CAPABLE_CLIS, "claude", "agy", defaultCli].filter(Boolean)),
  );
  for (const cli of clis) {
    try {
      const bridge = await ensureMCPConfigForCLI(cli, projectPath);
      console.log(`[Pheromone] Auto MCP for ${cli}: ${bridge}`);
    } catch (e) {
      console.warn(`[Pheromone] Auto MCP setup failed for ${cli} @ ${projectPath}:`, e);
    }
  }
  try {
    await ensureCliWorkspaceTrust("claude", projectPath);
  } catch (e) {
    console.warn(`[Pheromone] Workspace trust setup failed for ${projectPath}:`, e);
  }
}
