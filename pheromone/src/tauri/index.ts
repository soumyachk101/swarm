import { invoke } from "@tauri-apps/api/core";
import type { InjectionContext, InjectionResult } from "../injection/index.js";

// ── Tauri IPC request/response types ──────────────────────────────────────
export interface PheromoneEnsureStructureRequest { project_path: string; }
export interface PheromoneEnsureStructureResponse { success: boolean; created_files: string[]; }

export interface PheromoneReadMemoryFileRequest { project_path: string; relative_path: string; }
export interface PheromoneReadMemoryFileResponse { content: string; frontmatter: any; file_type: string; }

export interface PheromoneWriteMemoryFileRequest { project_path: string; relative_path: string; content: string; frontmatter?: any; }
export interface PheromoneWriteMemoryFileResponse { success: boolean; path: string; }

export interface PheromoneListMemoryFilesRequest { project_path: string; }
export interface PheromoneListMemoryFilesResponse { files: string[]; }

export interface PheromoneParseMarkdownToChunksRequest { content: string; }
export interface ChunkInfo { text: string; heading?: string; chunk_index?: number; }
export interface PheromoneParseMarkdownToChunksResponse { chunks: ChunkInfo[]; }

export interface PheromoneIndexFileRequest { project_path: string; relative_path: string; }
export interface PheromoneIndexFileResponse { success: boolean; chunks_indexed: number; }

export interface PheromoneSearchRequest { project_path: string; query: string; limit?: number; min_score?: number; }
export interface PheromoneSearchResponse { results: Array<{ chunk: ChunkInfo; source_file: string; score: number }>; }

export interface PheromoneInjectRequest { project_path: string; task: string; open_files: string[]; git_diff?: string; max_tokens?: number; max_chunks?: number; min_score?: number; }
export interface InjectedChunk { content: string; source_file: string; score: number; }
export interface PheromoneInjectResponse { chunks: InjectedChunk[]; query: string; total_tokens: number; }

export interface PheromoneFormatContextRequest { agent_type: string; chunks: InjectedChunk[]; }
export interface PheromoneFormatContextResponse { formatted_text: string; }

export interface PheromoneLogSessionRequest { project_path: string; session_id: string; agent_type: string; task: string; query: string; chunks: InjectedChunk[]; total_tokens: number; title?: string; branch?: string; worktree_id?: string; message_count?: number; }
export interface PheromoneLogSessionResponse { success: boolean; log_path: string; }

export interface PheromoneListSessionsRequest { project_path: string; scope: 'worktree' | 'agent' | 'all'; filter?: string; worktree_id?: string; agent_id?: string; }
export interface PheromoneSessionEntry { id: string; agent_type: string; title: string; branch: string | null; worktree_id: string | null; message_count: number | null; total_tokens: number | null; timestamp: number | null; preview: string | null; }
export interface PheromoneListSessionsResponse { sessions: PheromoneSessionEntry[]; }

export interface PheromoneCloseRequest { project_path: string; }
export interface PheromoneCloseResponse { success: boolean; }

// ── Tauri Pheromone API wrapper ──────────────────────────────────────────────
export class TauriPheromone {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  static async create(projectPath: string): Promise<TauriPheromone> {
    const pheromone = new TauriPheromone(projectPath);
    await pheromone.ensureStructure();
    return pheromone;
  }

  async ensureStructure(): Promise<PheromoneEnsureStructureResponse> {
    return await invoke<PheromoneEnsureStructureResponse>("pheromone_ensure_structure", { req: { project_path: this.projectPath } });
  }

  async readMemoryFile(relativePath: string): Promise<PheromoneReadMemoryFileResponse> {
    return await invoke<PheromoneReadMemoryFileResponse>("pheromone_read_memory_file", { req: { project_path: this.projectPath, relative_path: relativePath } });
  }

  async writeMemoryFile(relativePath: string, content: string, frontmatter?: any): Promise<PheromoneWriteMemoryFileResponse> {
    const result = await invoke<PheromoneWriteMemoryFileResponse>("pheromone_write_memory_file", { req: { project_path: this.projectPath, relative_path: relativePath, content, frontmatter } });
    try { await this.indexFile(relativePath); } catch (e) { console.warn(`[Pheromone] Failed to index ${relativePath} after write:`, e); }
    return result;
  }

  async listMemoryFiles(): Promise<PheromoneListMemoryFilesResponse> {
    return await invoke<PheromoneListMemoryFilesResponse>("pheromone_list_memory_files", { req: { project_path: this.projectPath } });
  }

  async parseMarkdownToChunks(content: string): Promise<PheromoneParseMarkdownToChunksResponse> {
    return await invoke<PheromoneParseMarkdownToChunksResponse>("pheromone_parse_markdown_to_chunks", { req: { content } });
  }

  async indexFile(relativePath: string): Promise<PheromoneIndexFileResponse> {
    return await invoke<PheromoneIndexFileResponse>("pheromone_index_file", { req: { project_path: this.projectPath, relative_path: relativePath } });
  }

  async search(query: string, options?: { limit?: number; min_score?: number }): Promise<PheromoneSearchResponse> {
    return await invoke<PheromoneSearchResponse>("pheromone_search", { req: { project_path: this.projectPath, query, limit: options?.limit, min_score: options?.min_score } });
  }

  async inject(task: string, openFiles: string[], gitDiff?: string, options?: { max_tokens?: number; max_chunks?: number; min_score?: number }): Promise<PheromoneInjectResponse> {
    return await invoke<PheromoneInjectResponse>("pheromone_inject", { req: { project_path: this.projectPath, task, open_files: openFiles, git_diff: gitDiff, max_tokens: options?.max_tokens, max_chunks: options?.max_chunks, min_score: options?.min_score } });
  }

  async formatContext(agentType: string, chunks: InjectedChunk[]): Promise<PheromoneFormatContextResponse> {
    return await invoke<PheromoneFormatContextResponse>("pheromone_format_context", { req: { agent_type: agentType, chunks } });
  }

  async logSession(sessionId: string, agentType: string, task: string, query: string, chunks: InjectedChunk[], totalTokens: number): Promise<PheromoneLogSessionResponse> {
    return await invoke<PheromoneLogSessionResponse>("pheromone_log_session", { req: { project_path: this.projectPath, session_id: sessionId, agent_type: agentType, task, query, chunks, total_tokens: totalTokens } });
  }

  async listSessions(scope: 'worktree' | 'agent' | 'all' = 'all', filter?: string, worktreeId?: string, workspaceId?: string): Promise<PheromoneListSessionsResponse> {
    return await invoke<PheromoneListSessionsResponse>("pheromone_list_sessions", { req: { project_path: this.projectPath, scope, filter, worktree_id: worktreeId, agent_id: workspaceId } });
  }

  async close(): Promise<PheromoneCloseResponse> {
    return await invoke<PheromoneCloseResponse>("pheromone_close", { req: { project_path: this.projectPath } });
  }

  getMemoryManager(): TauriMemoryManager {
    return new TauriMemoryManager(this);
  }
}

// ── Memory manager wrapper ────────────────────────────────────────────────
export class TauriMemoryManager {
  private pheromone: TauriPheromone;

  constructor(pheromone: TauriPheromone) {
    this.pheromone = pheromone;
  }

  async ensureStructure(): Promise<void> { await this.pheromone.ensureStructure(); }

  async readMemoryFile(relativePath: string): Promise<{ content: string; frontmatter?: any; type: string } | null> {
    try { const r = await this.pheromone.readMemoryFile(relativePath); return { content: r.content, frontmatter: r.frontmatter, type: r.file_type }; } catch { return null; }
  }

  async writeMemoryFile(relativePath: string, content: string, frontmatter?: any): Promise<void> {
    await this.pheromone.writeMemoryFile(relativePath, content, frontmatter);
  }

  async listMemoryFiles(): Promise<string[]> {
    return (await this.pheromone.listMemoryFiles()).files;
  }

  async parseMarkdownToChunks(content: string): Promise<Array<{ text: string; heading?: string }>> {
    return (await this.pheromone.parseMarkdownToChunks(content)).chunks;
  }
}

// Re-export shared injection types from the main Pheromone package so Tauri
// consumers don't need to import from two paths for common types.
export type { InjectionContext, InjectionResult } from "../injection/index.js";

// Memory-file injection context builder (reads .pheromone/memory/*.md, ranks +
// budgets them). Lives here because it's Tauri-only (uses read_file/write_file).
export * from "./pheromoneContext.js";
