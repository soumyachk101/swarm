import { CliConfigAction, McpServerSpec, nectarCommand } from './types.js';

function joinProjectPath(projectPath: string, ...parts: string[]): string {
  const sep = projectPath.includes('\\') ? '\\' : '/';
  return [projectPath.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/**
 * Register nectar in `.mcp.json` and auto-approve every project MCP server
 * (nectar + any others like playwright) via `.claude/settings.local.json` so
 * Claude Code does not re-prompt "New MCP server found" on each WorkerBee spawn.
 */
export function claudeCodeConfig(spec: McpServerSpec): CliConfigAction {
  const command = nectarCommand(spec);
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
          servers.nectar = {
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

          // Auto-trust every server currently listed in .mcp.json (nectar + playwright, etc.).
          let serverNames: string[] = ['nectar'];
          try {
            // merge runs after mcpPath write in ensureMCPConfigForCLI — but when
            // settings merge runs we re-read mcp from the in-memory merge above
            // isn't available; caller may pass null. Collect from existing settings
            // and always include nectar. WorkerBeePane also syncs names after write.
            const prev = settings.enabledMcpjsonServers;
            if (Array.isArray(prev)) {
              serverNames = Array.from(new Set([...prev.map(String), 'nectar']));
            }
          } catch { /* keep nectar */ }

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
  if (!mcpJsonRaw) return ['nectar'];
  try {
    const config = JSON.parse(mcpJsonRaw);
    const servers = config?.mcpServers;
    if (servers && typeof servers === 'object') {
      const names = Object.keys(servers);
      return names.length ? names : ['nectar'];
    }
  } catch { /* fall through */ }
  return ['nectar'];
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
