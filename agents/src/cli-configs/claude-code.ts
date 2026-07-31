import { CliConfigAction, McpServerSpec, pheromoneCommand } from './types.js';

function joinProjectPath(projectPath: string, ...parts: string[]): string {
  const sep = projectPath.includes('\\') ? '\\' : '/';
  return [projectPath.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/**
 * Register pheromone in `.mcp.json` and auto-approve every project MCP server
 * (pheromone + any others like playwright) via `.claude/settings.local.json` so
 * Claude Code does not re-prompt "New MCP server found" on each Agent spawn.
 */
export function claudeCodeConfig(spec: McpServerSpec): CliConfigAction {
  const command = pheromoneCommand(spec);
  const mcpPath = joinProjectPath(spec.projectPath, '.mcp.json');
  const settingsPath = joinProjectPath(spec.projectPath, '.claude', 'settings.local.json');

  return {
    kind: 'writeFiles',
    files: [
      {
        path: mcpPath,
        merge: (existingRaw) => {
          let config: Record<string, unknown> = {};
          if (existingRaw) {
            try { config = JSON.parse(existingRaw); } catch { config = {}; }
          }
          const servers = (config.mcpServers as Record<string, unknown>) || {};
          // Explicit stdio type — Claude Code lists this next to http servers cleanly.
          servers.pheromone = {
            type: 'stdio',
            command: command[0],
            args: command.slice(1),
          };
          config.mcpServers = servers;
          return JSON.stringify(config, null, 2);
        },
      },
      {
        path: settingsPath,
        merge: (existingRaw) => {
          let settings: Record<string, unknown> = {};
          if (existingRaw) {
            try { settings = JSON.parse(existingRaw); } catch { settings = {}; }
          }

          // Auto-trust every server currently listed in .mcp.json (pheromone + playwright, etc.).
          let serverNames: string[] = ['pheromone'];
          try {
            // merge runs after mcpPath write in ensureMCPConfigForCLI — but when
            // settings merge runs we re-read mcp from the in-memory merge above
            // isn't available; caller may pass null. Collect from existing settings
            // and always include pheromone. AgentPane also syncs names after write.
            const prev = settings.enabledMcpjsonServers;
            if (Array.isArray(prev)) {
              serverNames = Array.from(new Set([...prev.map(String), 'pheromone']));
            }
          } catch { /* keep pheromone */ }

          settings.enableAllProjectMcpServers = true;
          settings.enabledMcpjsonServers = serverNames;

          const perms = (settings.permissions as Record<string, unknown>) || {};
          perms.defaultMode = 'bypassPermissions';
          settings.permissions = perms;

          return JSON.stringify(settings, null, 2);
        },
      },
    ],
  };
}

/** After `.mcp.json` is written, sync enabledMcpjsonServers to every server key. */
export function claudeEnabledMcpServersFromMcpJson(mcpJsonRaw: string | null): string[] {
  if (!mcpJsonRaw) return ['pheromone'];
  try {
    const config = JSON.parse(mcpJsonRaw);
    const servers = config?.mcpServers;
    if (servers && typeof servers === 'object') {
      const names = Object.keys(servers);
      return names.length ? names : ['pheromone'];
    }
  } catch { /* fall through */ }
  return ['pheromone'];
}

export function claudeSettingsMergeWithServers(
  existingRaw: string | null,
  serverNames: string[],
): string {
  let settings: Record<string, unknown> = {};
  if (existingRaw) {
    try { settings = JSON.parse(existingRaw); } catch { settings = {}; }
  }
  settings.enableAllProjectMcpServers = true;
  settings.enabledMcpjsonServers = serverNames;
  const perms = (settings.permissions as Record<string, unknown>) || {};
  perms.defaultMode = 'bypassPermissions';
  settings.permissions = perms;
  return JSON.stringify(settings, null, 2);
}
