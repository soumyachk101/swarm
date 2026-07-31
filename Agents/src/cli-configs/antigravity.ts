import { CliConfigAction, McpServerSpec, pheromoneCommand } from './types.js';

export function antigravityConfig(spec: McpServerSpec): CliConfigAction {
  const command = pheromoneCommand(spec);

  const pluginManifest = {
    name: 'pheromone',
    version: '0.1.0',
    description: 'Pheromone cross-agent memory (pheromone_query tool)',
  };

  const mcpConfig = {
    mcpServers: {
      pheromone: {
        command: command[0],
        args: command.slice(1),
      },
    },
  };

  return {
    kind: 'writePluginDir',
    pluginDir: spec.projectPath + '/.agents/plugins/pheromone',
    files: [
      { relativePath: 'plugin.json', content: JSON.stringify(pluginManifest, null, 2) },
      { relativePath: 'mcp_config.json', content: JSON.stringify(mcpConfig, null, 2) },
    ],
    installCommand: {
      command: 'agy',
      args: ['plugin', 'install', spec.projectPath + '/.agents/plugins/pheromone'],
    },
  };
}
