#!/usr/bin/env node
// Pheromone MCP server — exposes `pheromone_query` as an MCP tool over stdio.
//
// Spawned by MCP-capable CLIs (OpenCode, Claude Code, Codex, Kilo Code, Cline)
// per the per-CLI configs in ./cli-configs/*. All retrieval is delegated to
// the shared `@swarm/pheromone` package via ./tools/pheromone-query — this server
// contains NO retrieval logic of its own.
import { createInterface } from 'node:readline';
import { PHEROMONE_QUERY_TOOL, runPheromoneQuery } from './tools/pheromone-query.js';
import { PLAN_TOOLS, PLAN_TOOL_NAMES, runPlanTool } from './tools/plans.js';
import { LEAD_TOOLS, LEAD_TOOL_NAMES, runLeadTool } from './tools/lead.js';
import { SWARM_CHAT_TOOLS, SWARM_CHAT_TOOL_NAMES, runSwarmChatTool } from './tools/swarm-chat.js';

function parseProjectPath(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' && i + 1 < argv.length) return argv[i + 1];
  }
  return '';
}

function send(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

interface JsonRpcMessage {
  id?: number | string | null;
  method?: string;
  params?: any;
}

async function handleRequest(msg: JsonRpcMessage, projectPath: string): Promise<unknown | null> {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'pheromone-mcp', version: '0.1.0' },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null; // notification: no response
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: [PHEROMONE_QUERY_TOOL, ...PLAN_TOOLS, ...SWARM_CHAT_TOOLS, ...LEAD_TOOLS] } };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'pheromone_query') {
      try {
        const result = await runPheromoneQuery(projectPath, args);
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: result.text }] },
        };
      } catch (e) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `pheromone_query failed: ${(e as Error).message}` }],
            isError: true,
          },
        };
      }
    }

    if (PLAN_TOOL_NAMES.has(toolName)) {
      try {
        const result = await runPlanTool(projectPath, toolName, args);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: result.text }] } };
      } catch (e) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `${toolName} failed: ${(e as Error).message}` }],
            isError: true,
          },
        };
      }
    }

    if (SWARM_CHAT_TOOL_NAMES.has(toolName)) {
      try {
        const result = await runSwarmChatTool(projectPath, toolName, args);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: result.text }] } };
      } catch (e) {
        return {
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: `${toolName} failed: ${(e as Error).message}` }], isError: true },
        };
      }
    }

    if (LEAD_TOOL_NAMES.has(toolName)) {
      try {
        const result = await runLeadTool(projectPath, toolName, args);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: result.text }] } };
      } catch (e) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `${toolName} failed: ${(e as Error).message}` }],
            isError: true,
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true },
    };
  }

  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result: { content: [{ type: 'text', text: `Unknown method: ${method}` }], isError: true },
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const projectPath = parseProjectPath(argv);
  if (!projectPath) {
    process.stderr.write('Usage: pheromone-mcp --project <project-path>\n');
    process.exit(1);
  }

  process.stderr.write(`[pheromone-mcp] started for project: ${projectPath}\n`);

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line) as JsonRpcMessage;
      const response = await handleRequest(msg, projectPath);
      if (response) send(response);
    } catch (e) {
      process.stderr.write(`[pheromone-mcp] parse error: ${e}\n`);
    }
  }

  process.stderr.write('[pheromone-mcp] exiting\n');
}

// Only run the loop when executed directly (not when imported by a test).
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server.ts'));
if (isDirectRun) {
  main().catch((e) => {
    process.stderr.write(`[pheromone-mcp] fatal: ${e}\n`);
    process.exit(1);
  });
}
