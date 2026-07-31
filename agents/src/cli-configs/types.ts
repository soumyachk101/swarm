export interface McpServerSpec {
  mcpServerPath: string;
  projectPath: string;
}

export interface FileConfigAction {
  kind: 'writeFile';
  path: string;
  merge: (existingRaw: string | null) => string;
}

/** Write several config files in order (e.g. .mcp.json then settings.local.json). */
export interface FilesConfigAction {
  kind: 'writeFiles';
  files: Array<{
    path: string;
    merge: (existingRaw: string | null) => string;
  }>;
}

export interface CommandConfigAction {
  kind: 'runCommand';
  command: string;
  args: string[];
}

export interface NoopConfigAction {
  kind: 'noop';
  reason: string;
}

export interface PluginFile {
  relativePath: string;
  content: string;
}

export interface PluginDirConfigAction {
  kind: 'writePluginDir';
  pluginDir: string;
  files: PluginFile[];
  installCommand?: { command: string; args: string[] };
}

export type CliConfigAction =
  | FileConfigAction
  | FilesConfigAction
  | CommandConfigAction
  | NoopConfigAction
  | PluginDirConfigAction;

/**
 * Normalize a filesystem path for Node MCP configs.
 * Strips Windows extended-length prefixes (`\\?\` / `//?/`) that break `node`,
 * then uses forward slashes (valid on Windows for Node).
 */
export function toNodePath(path: string): string {
  let s = path.trim();
  if (s.startsWith('\\\\?\\')) s = s.slice(4);
  if (s.startsWith('//?/')) s = s.slice(4);
  // Also handle already-mangled slash form of the extended prefix.
  if (/^\/\/\?\/[A-Za-z]:/.test(s)) s = s.slice(4);
  return s.replace(/\\/g, '/');
}

export function pheromoneCommand(spec: McpServerSpec): string[] {
  return ['node', toNodePath(spec.mcpServerPath), '--project', toNodePath(spec.projectPath)];
}
