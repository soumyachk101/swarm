import { CliConfigAction, McpServerSpec, pheromoneCommand } from './types.js';

export function kiloCodeConfig(spec: McpServerSpec): CliConfigAction {
  const command = pheromoneCommand(spec);
  const configFile = spec.projectPath + '/kilo.jsonc';

  return {
    kind: 'writeFile',
    path: configFile,
    merge: (existingRaw) => {
      let config: any = {};
      if (existingRaw) {
        try { config = JSON.parse(existingRaw); } catch { config = {}; }
      }
      config.mcp = config.mcp || {};
      config.mcp.pheromone = { type: 'local', command, enabled: true };
      if (!config.$schema) config.$schema = 'https://app.kilo.ai/config.json';
      return JSON.stringify(config, null, 2);
    },
  };
}
