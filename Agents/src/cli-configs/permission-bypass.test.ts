import { describe, it, expect } from 'vitest';
import { permissionBypassArgs, withPermissionBypass } from './permission-bypass.js';
import {
  claudeEnabledMcpServersFromMcpJson,
  claudeSettingsMergeWithServers,
} from './claude-code.js';
import { pheromoneCommand, toNodePath } from './types.js';

describe('permissionBypassArgs', () => {
  it('returns Claude skip-permissions flag', () => {
    expect(permissionBypassArgs('claude')).toEqual(['--dangerously-skip-permissions']);
  });

  it('merges without duplicating', () => {
    expect(withPermissionBypass('claude', ['--dangerously-skip-permissions', '-p'])).toEqual([
      '--dangerously-skip-permissions',
      '-p',
    ]);
    expect(withPermissionBypass('claude', ['-p'])).toEqual([
      '--dangerously-skip-permissions',
      '-p',
    ]);
  });
});

describe('toNodePath / pheromoneCommand', () => {
  it('strips Windows extended-length prefixes that break node', () => {
    expect(toNodePath('\\\\?\\C:\\Users\\rakti\\server.js')).toBe('C:/Users/rakti/server.js');
    expect(toNodePath('//?/C:/Users/rakti/server.js')).toBe('C:/Users/rakti/server.js');
  });

  it('builds a runnable node command', () => {
    const cmd = pheromoneCommand({
      mcpServerPath: '\\\\?\\C:\\swarm\\Pheromone\\pheromone-mcp\\dist\\server.js',
      projectPath: 'C:\\Users\\rakti\\Desktop\\code\\Normal\\prg-test',
    });
    expect(cmd).toEqual([
      'node',
      'C:/swarm/Pheromone/pheromone-mcp/dist/server.js',
      '--project',
      'C:/Users/rakti/Desktop/code/Normal/prg-test',
    ]);
  });
});

describe('claude MCP auto-approve helpers', () => {
  it('lists every server from .mcp.json', () => {
    const names = claudeEnabledMcpServersFromMcpJson(
      JSON.stringify({ mcpServers: { pheromone: {}, playwright: {} } }),
    );
    expect(names.sort()).toEqual(['pheromone', 'playwright']);
  });

  it('writes enableAllProjectMcpServers + bypass mode', () => {
    const out = JSON.parse(claudeSettingsMergeWithServers(null, ['pheromone', 'playwright']));
    expect(out.enableAllProjectMcpServers).toBe(true);
    expect(out.enabledMcpjsonServers).toEqual(['pheromone', 'playwright']);
    expect(out.permissions.defaultMode).toBe('bypassPermissions');
  });
});
