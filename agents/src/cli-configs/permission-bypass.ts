/**
 * Default CLI flags so Agents don't re-prompt for tool/MCP approval every
 * turn. Caller merges these ahead of any user-supplied args (without duplicating).
 */
export function permissionBypassArgs(cli: string): string[] {
  switch (cli) {
    case 'claude':
      return ['--dangerously-skip-permissions'];
    case 'codex':
      return ['--dangerously-bypass-approvals-and-sandbox'];
    case 'opencode':
      // Official auto-approve flag (docs); --yolo is an alias on some builds.
      return ['--auto'];
    case 'aider':
      return ['--yes'];
    case 'cline':
      return ['--yolo'];
    default:
      // kimi / cursor / kiro / kilo / agy: no stable public skip flag yet.
      return [];
  }
}

/** Merge bypass flags into existing args without duplicating. */
export function withPermissionBypass(cli: string, args: string[] = []): string[] {
  const bypass = permissionBypassArgs(cli);
  if (bypass.length === 0) return args;
  const have = new Set(args);
  const missing = bypass.filter((a) => !have.has(a));
  return missing.length ? [...missing, ...args] : args;
}
