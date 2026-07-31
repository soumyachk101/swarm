import type { CLISlug } from '@swarm/agents';

/**
 * A launchable CLI agent id. The catalogue itself (names, commands,
 * descriptions) lives in `@swarm/agents` — this is only the local alias.
 */
export type CLIType = CLISlug;
