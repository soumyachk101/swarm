import type { Pheromone, InjectionContext, InjectionResult } from '@swarm/pheromone';
import type { AgentAdapter, LaunchContext, SessionSummary, CommandConfig } from './types.js';
import { OpenCodeAdapter } from './adapters/opencode.js';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import { CodexAdapter } from './adapters/codex.js';
import { AiderAdapter } from './adapters/aider.js';
import { AntigravityAdapter } from './adapters/antigravity.js';
import { KimiCodeAdapter } from './adapters/kimi-code.js';
import { ClineAdapter } from './adapters/cline.js';
import { CursorAdapter } from './adapters/cursor.js';
import { KiroAdapter } from './adapters/kiro.js';
import { KiloAdapter } from './adapters/kilo.js';

export interface LaunchOptions {
  projectPath: string;
  paneId: string;
  task: string;
  agentType: 'claude' | 'codex' | 'aider' | 'antigravity' | 'opencode' | 'kimi' | 'cline' | 'cursor' | 'kiro' | 'kilo';
  openFiles?: string[];
  gitDiff?: string;
}

export interface LaunchResult {
  sessionId: string;
  command: CommandConfig;
  injectionText?: string;
}

export class AgentLauncher {
  private pheromone: Pheromone;
  private activeSessions: Map<string, { adapter: AgentAdapter; sessionId: string }>;

  constructor(pheromone: Pheromone) {
    this.pheromone = pheromone;
    this.activeSessions = new Map();
  }

  async launch(options: LaunchOptions): Promise<LaunchResult> {
    const sessionId = `${options.agentType}-${Date.now()}`;

    const injectionContext: InjectionContext = {
      task: options.task,
      openFiles: options.openFiles || [],
      gitDiff: options.gitDiff,
    };

    const pheromoneContext: InjectionResult = await this.pheromone.inject(injectionContext);

    const memoryManager = this.pheromone.getMemoryManager();
    await memoryManager.writeMemoryFile(
      `agents/sessions/${sessionId}.md`,
      `# Session Started\n\nAgent: ${options.agentType}\nTask: ${options.task}\nInjection: ${pheromoneContext.chunks.length} chunks\n`,
      { agent: options.agentType, timestamp: Date.now() }
    );

    const adapter = this.createAdapter(options.agentType);

    const launchContext: LaunchContext = {
      paneId: options.paneId,
      task: options.task,
      openFiles: options.openFiles || [],
      gitDiff: options.gitDiff,
      pheromoneContext,
    };

    const command = adapter.getCommand(launchContext);
    const injectionText = adapter.formatContext(pheromoneContext);

    if (injectionText && command.args.length > 0) {
      command.args[0] = `${injectionText}\n\n${command.args[0]}`;
    } else if (injectionText) {
      command.args.unshift(injectionText);
    }

    this.activeSessions.set(sessionId, { adapter, sessionId });

    return { sessionId, command, injectionText };
  }

  async endSession(sessionId: string, summary: SessionSummary): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await session.adapter.onSessionEnd(summary);
    this.activeSessions.delete(sessionId);
  }

  private createAdapter(type: LaunchOptions['agentType']): AgentAdapter {
    switch (type) {
      case 'claude':
        return new ClaudeCodeAdapter(this.pheromone);
      case 'codex':
        return new CodexAdapter(this.pheromone);
      case 'aider':
        return new AiderAdapter(this.pheromone);
      case 'antigravity':
        return new AntigravityAdapter(this.pheromone);
      case 'opencode':
        return new OpenCodeAdapter(this.pheromone);
      case 'kimi':
        return new KimiCodeAdapter(this.pheromone);
      case 'cline':
        return new ClineAdapter(this.pheromone);
      case 'cursor':
        return new CursorAdapter(this.pheromone);
      case 'kiro':
        return new KiroAdapter(this.pheromone);
      case 'kilo':
        return new KiloAdapter(this.pheromone);
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }
}
