import { CliConfigAction, McpServerSpec, pheromoneCommand } from './types.js';

export function codexConfig(spec: McpServerSpec): CliConfigAction {
  const command = pheromoneCommand(spec);
  return {
    kind: 'runCommand',
    command: 'codex',
    args: ['mcp', 'add', 'pheromone', '--', ...command],
  };
}
