import { CliConfigAction, McpServerSpec, pheromoneCommand } from './types.js';

export function clineConfig(spec: McpServerSpec): CliConfigAction {
  const command = pheromoneCommand(spec);
  const quoted = command.map((s) => (s.includes(' ') ? `"${s}"` : s));
  const wrapper = quoted.join(' ');

  return {
    kind: 'runCommand',
    command: 'cline',
    args: ['mcp', 'install', 'pheromone', '--yes', '--', 'cmd', '/c', wrapper],
  };
}
