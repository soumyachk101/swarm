// The `pheromone_query` MCP tool.
//
// This is the ONLY place the MCP server does retrieval, and it does NOT
// reimplement any of it: the embedding, keyword (FTS4 mirror), vector and RRF
// hybrid-merge logic all live in `@swarm/pheromone` (Pheromone/src/search +
// Pheromone/src/injection) and are imported here. Deleting this file's imports
// and pasting search logic back in would reintroduce the duplication this
// package was created to remove — don't.
import { PheromoneDatabase, SearchEngine, InjectionPipeline, MemoryManager } from '@swarm/pheromone';

export interface PheromoneQueryArgs {
  task: string;
  open_files?: string[];
  git_diff?: string;
  max_chunks?: number;
}

export interface PheromoneQueryChunk {
  content: string;
  sourceFile: string;
  score: number;
}

export interface PheromoneQueryResult {
  chunks: PheromoneQueryChunk[];
  query: string;
  text: string;
}

export const PHEROMONE_QUERY_TOOL = {
  name: 'pheromone_query',
  description:
    "Search the project's shared cross-agent memory (Pheromone) for relevant context. " +
    'Call this when the user asks about previous work, decisions, bugs, conventions, ' +
    'architecture, or anything that was done in a prior session by a different AI agent. ' +
    'Returns ranked chunks from memory files (.pheromone/memory/*.md) and session handoffs.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The question or task to search memory for' },
      open_files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Currently open file paths (optional)',
      },
      git_diff: { type: 'string', description: 'Recent git diff for context (optional)' },
      max_chunks: { type: 'number', description: 'Maximum number of chunks to return (default 10)' },
    },
    required: ['task'],
  },
} as const;

/**
 * Run a Pheromone memory query against `<projectPath>/.pheromone/pheromone.db` using the
 * shared retrieval pipeline. read-only: never writes the DB back.
 */
export async function runPheromoneQuery(
  projectPath: string,
  args: PheromoneQueryArgs,
): Promise<PheromoneQueryResult> {
  const task = args.task || '';
  const openFiles = args.open_files || [];
  const gitDiff = args.git_diff || '';
  const maxChunks = args.max_chunks || 10;

  const db = await PheromoneDatabase.create(projectPath);
  try {
    const engine = new SearchEngine(db);
    const memory = new MemoryManager(db, projectPath);
    // minScore 0: RRF fused scores are inherently small (~1/60); filtering by a
    // higher threshold here would drop all valid results.
    const pipeline = new InjectionPipeline(engine, memory, {
      minScore: 0,
      maxChunks,
      maxTokens: 4000,
    });

    const injection = await pipeline.inject({ task, openFiles, gitDiff });

    const chunks: PheromoneQueryChunk[] = injection.chunks.map((c) => ({
      content: c.content,
      sourceFile: c.sourceFile,
      score: c.score,
    }));

    const body = chunks
      .map((r, i) => `[${i + 1}] ${r.sourceFile} (score: ${r.score.toFixed(3)})\n${r.content}`)
      .join('\n\n---\n\n');

    const text =
      chunks.length > 0
        ? `Found ${chunks.length} relevant memory chunk(s):\n\n${body}`
        : 'No relevant project memory found for this query.';

    return { chunks, query: injection.query, text };
  } finally {
    // read-only usage: intentionally do NOT call db.close(), which would
    // persist the in-memory FTS4 mirror back into the real pheromone.db.
  }
}
