"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import { WebglAddon } from "xterm-addon-webgl";
import {
  Copy,
  Trash2,
  Eraser,
  Maximize2,
  Minimize2,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Check,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { BrandGlyph, cliBrand, AgentMark } from "@swarm/board";
import { envForCli } from "../cli-configs/env.js";
import { agentsHost } from "./host.js";
import { useAgentsStore } from "./agentsStore.js";
import { TauriPheromone as Pheromone } from "@swarm/pheromone/tauri";
import { withPermissionBypass, MCP_CAPABLE_CLIS } from "../cli-configs/index.js";
import { CLI_BY_COMMAND } from "../index.js";
import { ensureMCPConfigForCLI, type PheromoneBridge } from "./ensureMcpConfig.js";
import { ensureCliWorkspaceTrust } from "./ensureWorkspaceTrust.js";
import { excerptForHandoff, looksLikeTerminalGarbage, stripTerminalNoise } from "./sanitizeHandoff.js";
import { isAlreadySpawned, isTrackedAsSpawned, markSpawned, saveTranscript, takeTranscript } from "./spawnGuard.js";
import { withHandoffLock } from "./handoffQueue.js";
import RoleBadge from "./RoleBadge.js";
import { LeadCrown } from "@swarm/board";
import { PANE_HEADER_CLASS, themeForKind } from "@swarm/board";
import type { LeadMode } from "@swarm/lead";
import {
  THEME_CHANGE_EVENT,
  buildXtermThemeFromDom,
  swarmHex,
} from "./themeColors.js";
import { onWindowResize } from "./paneResize.js";

// A Agent pane is a CLI agent process (Claude Code, Codex CLI, Aider,
// Gemini CLI, OpenCode, Kimi Code, Cline, ...) — a fundamentally different
// thing from a plain shell terminal (see components/terminal/TerminalPane).
// It's wired to inject Pheromone project memory and pass provider API keys, and
// it has no concept of "which shell" — it's always exactly one CLI command.
export interface AgentInfo {
  id: string;
  cli: string;
  cliName: string;
  customName?: string;
  args?: string[];
  role?: string;
  branchName?: string;
  /** Which agent (folder) this pane belongs to — see agentsStore. */
  workspaceId?: string;
  /** Set while this swarm wears the crown — see agentsStore. */
  isLead?: boolean;
  leadMode?: LeadMode;
  /** Model / effort this swarm was summoned with, when pinned. */
  model?: string;
  effort?: string;
}

interface AgentPaneProps {
  paneId: string;
  workingDir?: string | null;
  agent: AgentInfo;
  onClose?: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
  onRename?: () => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onCancelRename?: () => void;
  /** Extra header control (e.g. worktree selector) rendered next to the name. */
  headerExtra?: React.ReactNode;
  /** Shared agent mind: the dir whose .pheromone all agents sync into (the
   *  agent root), so agents in different trees see each other's handoffs.
   *  Falls back to the pane's own working dir when absent. */
  sharedMemoryDir?: string | null;
}

// How long to wait with zero output before hinting that the CLI might not be
// installed, rather than leaving the user staring at an ambiguous spinner.
const STALL_HINT_MS = 8000;

// Below this the header cannot hold six icons without them colliding with the
// pane name, so the view controls fold into an overflow menu.
const COMPACT_HEADER_WIDTH = 240;

// xterm's theme, but with a real opaque background instead of the helper's
// `#00000000`. The terminal region already sits on an opaque `--swarm-canvas-hi`
// surface (see the content div below), so nothing of the glass was ever visible
// through the canvas — all the transparency bought was per-cell alpha blending
// on the slow renderer, and it blocked the WebGL renderer entirely. Colour is
// read live from the token so theme switches still land.
const paneXtermTheme = () => ({
  ...buildXtermThemeFromDom(),
  background: swarmHex("--swarm-canvas-hi"),
});

// CLI install instructions — imported from @swarm/agents which is the
// single source of truth for all CLI agent metadata.

// Returns true if a spawn error message indicates the executable wasn't found.
function isNotFoundError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("program not found") ||
    msg.includes("no such file") ||
    msg.includes("os error 2") ||
    msg.includes("the system cannot find the file") ||
    msg.includes("not recognized as an internal") ||
    msg.includes("command not found") ||
    msg.includes("cannot find the path")
  );
}

function detectCommandNotFoundError(output: string, command: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes("is not recognized as an internal or external command") ||
    lower.includes("not recognized as the name of a cmdlet") ||
    lower.includes("command not found") ||
    lower.includes("no such file or directory") ||
    (lower.includes("not found") && lower.includes(command.toLowerCase()))
  );
}

interface CLINotFoundCardProps {
  cli: string;
  cliName: string;
  onClose?: () => void;
}

function CLINotFoundCard({ cli, cliName, onClose }: CLINotFoundCardProps) {
  const [copied, setCopied] = useState(false);
  const info = CLI_BY_COMMAND[cli];

  const copy = () => {
    navigator.clipboard.writeText(info?.installCmd ?? cli);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-5 animate-fade-in">
      {/* Icon + heading */}
      <div className="flex flex-col items-center gap-2 text-center">
        {/* The CLI's own logo, so the screen names the missing tool visually. */}
        <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-swarm-gold shadow-glass">
          {cliBrand(info?.id) ? <BrandGlyph brand={cliBrand(info?.id)!} size={24} /> : <AgentMark size={24} />}
        </div>
        <div>
          <p className="text-sm font-semibold text-swarm-text">
            {info?.name ?? cliName} not installed
          </p>
          <p className="text-mini text-swarm-textMuted mt-0.5">
            {info?.description ?? `Could not find \`${cli}\` on PATH`}
          </p>
        </div>
      </div>

      {/* Install command */}
      {info && (
        <div className="w-full max-w-[340px] space-y-2">
          <p className="text-mini text-swarm-textDim uppercase tracking-wide font-semibold">
            Install command
          </p>
          <div className="relative rounded-xl glass border border-swarm-border/70 overflow-hidden">
            <pre className="text-mini font-mono text-swarm-gold px-3 py-2.5 pr-10 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {info.installCmd}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-swarm-border/40 hover:bg-swarm-gold/20 text-swarm-textDim hover:text-swarm-gold transition-all"
              title="Copy install command"
            >
              {copied ? (
                <Check size={11} className="text-swarm-gold" />
              ) : (
                <Copy size={11} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {info?.docsUrl && (
          <a
            href={info.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-swarm-gold/10 border border-swarm-gold/25 text-swarm-goldHi hover:bg-swarm-gold/20 transition-colors"
          >
            <ExternalLink size={12} />
            Open docs
          </a>
        )}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs glass border border-swarm-border/70 text-swarm-textDim hover:text-swarm-text transition-colors"
        >
          <Trash2 size={12} />
          Remove pane
        </button>
      </div>
    </div>
  );
}

// A freshly-scaffolded memory file is just its placeholder HTML comment —
// FTS5 will happily "match" that noise against broad keywords. AGENTS.md
// §4.2.4: "if nothing clears a minimum relevance threshold, inject nothing."
function isMeaningfulChunk(content: string): boolean {
  return content.replace(/<!--[\s\S]*?-->/g, "").trim().length > 0;
}

// Injected context is written straight into the pty's stdin, not typed by a
// human through xterm's own paste handling. Almost every CLI chat input
// (readline, Ink, prompt_toolkit, ...) treats a bare `\n` as "Enter pressed,"
// not "insert newline" — so a multi-line context blob piped in raw arrives
// as dozens of fragmentary submissions instead of one coherent message.
function flattenForStdin(text: string): string {
  return stripTerminalNoise(text.replace(/\r?\n+/g, " "));
}

export default function AgentPane({
  paneId,
  workingDir,
  agent,
  onClose,
  onToggleMaximize,
  isMaximized,
  onRename,
  isEditing,
  editValue,
  onEditChange,
  onCancelRename,
  headerExtra,
  sharedMemoryDir,
}: AgentPaneProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  // Manual/auto sync of this agent's transcript into the shared agent mind.
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  // Set inside the terminal effect so the header button can trigger a sync now.
  const syncNowRef = useRef<null | (() => Promise<void>)>(null);
  // Keep the latest shared-dir in a ref so the long-lived effect always syncs
  // to the current agent root without re-running (which would respawn).
  const sharedDirRef = useRef<string | null | undefined>(sharedMemoryDir);
  sharedDirRef.current = sharedMemoryDir;
  const terminalInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Held outside the terminal effect so the live-theme listener can tell
  // whether the GPU renderer is still the one painting.
  const webglRef = useRef<WebglAddon | null>(null);
  const [spawnState, setSpawnState] = useState<"connecting" | "running" | "error" | "notFound">("connecting");
  const [stalled, setStalled] = useState(false);
  // Keys come from the host (the app owns settings); the CLI-to-env mapping
  // is this package's own business — see cli-configs/env.
  const apiKeys = agentsHost().apiKeys();

  const [paneWidth, setPaneWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const compactHeader = paneWidth > 0 && paneWidth < COMPACT_HEADER_WIDTH;
  const refitCount = useAgentsStore((s) => s.refitCount);

  // Dismiss the overflow menu on an outside click, Escape, or the pane simply
  // growing wide enough to show the buttons again — otherwise it hangs there
  // detached from anything the user is still doing. Listens on mousedown, not
  // blur: WebKit (which is what Tauri runs on macOS) does not focus a button on
  // click, so a blur-based close never fires there.
  useEffect(() => {
    if (!menuOpen) return;
    if (!compactHeader) {
      setMenuOpen(false);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, compactHeader]);

  // Crown state — one Lead per agent, so this only looks at the swarms
  // of this pane's own folder.
  const leadId = useAgentsStore(
    (s) => s.agents.find((b) => b.isLead && b.workspaceId === agent.workspaceId)?.id ?? null,
  );
  const promoteToLead = useAgentsStore((s) => s.promoteToLead);
  const demoteLead = useAgentsStore((s) => s.demoteLead);
  const isLead = leadId === agent.id;
  const leadTaken = leadId !== null && !isLead;
  // The spawn effect is long-lived; read the crown through a ref so promoting
  // never re-runs it (and so the boot injection sees the current role).
  const leadRef = useRef<{ isLead: boolean; mode: LeadMode }>({
    isLead, mode: agent.leadMode ?? "Steward",
  });
  leadRef.current = { isLead, mode: agent.leadMode ?? "Steward" };

  // Re-fit xterm whenever a global refit signal fires (tab switch / maximize
  // restore). Kept separate from the spawn effect so this never re-spawns.
  useEffect(() => {
    if (!fitAddonRef.current || !terminalRef.current || !terminalInstance.current) return;
    const rect = terminalRef.current.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      try {
        fitAddonRef.current.fit();
        // fit() only repaints when cols/rows actually change — a minimize/
        // restore leaves the container size unchanged, so the canvas stays
        // stale (ghosted/overlapping glyphs) unless we force a redraw too.
        terminalInstance.current.refresh(0, terminalInstance.current.rows - 1);
      } catch {}
    }
  }, [refitCount]);

  const getFontSize = () => {
    // 0 means "not measured yet", not "tiny". Guessing the smallest font before
    // the first ResizeObserver callback and then jumping to 14 meant the pty
    // could be opened at a column count the pane never actually had — and a CLI
    // draws its welcome box once, for the width it was given at startup.
    if (paneWidth === 0) return 14;
    // Floor is 11px, not smaller — below that the terminal stops being
    // readable, so a cramped multi-pane grid should scroll/clip text rather
    // than shrink it into illegibility.
    if (paneWidth < 380) return 11;
    if (paneWidth < 500) return 12;
    return 14;
  };

  const fontSize = getFontSize();

  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.fontSize = fontSize;
      // Only fit against a container that actually has a size. A pane can be
      // mounted at 0x0 — the right dock hides its inactive tab with
      // `display:none` rather than unmounting it, so the Lead agent keeps
      // running behind a zero-size element. fit() on that yields a nonsense
      // grid, and pushing it to the pty reflows a live agent's output for a
      // resize the user never made.
      const rect = terminalRef.current?.getBoundingClientRect();
      if (fitAddonRef.current && rect && rect.width > 0 && rect.height > 0) {
        try {
          // The GPU renderer caches every glyph in a texture atlas keyed by the
          // size it was rasterised at. Changing fontSize without dropping the
          // atlas leaves xterm scaling yesterday's bitmaps into today's cells —
          // smeared text, and box-drawing borders whose corners no longer meet.
          // Resizing a pane crosses the font-size ladder, so this fires often.
          webglRef.current?.clearTextureAtlas();
          fitAddonRef.current.fit();
          const { rows, cols } = terminalInstance.current;
          invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        } catch (e) {
          console.warn("Failed to refit terminal after font size change:", e);
        }
      }
    }
  }, [fontSize, paneId]);

  const displayName = agent.customName || agent.cliName;

  const writeToProcess = (data: string) => {
    invoke("write_to_terminal", { paneId, data }).catch((e) =>
      console.error(`write_to_terminal failed for ${paneId}:`, e),
    );
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    let disposed = false;
    let terminal: XTerm | null = null;
    let onDataDisposable: { dispose: () => void } | null = null;
    let unsubscribeResize: (() => void) | null = null;
    let observerRef: ResizeObserver | null = null;
    let webglAddon: WebglAddon | null = null;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeDebounce: ReturnType<typeof setTimeout> | null = null;
    let liveHandoffInterval: ReturnType<typeof setInterval> | null = null;
    let unlistenOutput: UnlistenFn | null = null;
    let aliveCheckInterval: ReturnType<typeof setInterval> | null = null;
    let outputSubscribed = false;
    let spawnDir = workingDir;
    const transcriptRef = { current: "" };
    let summarySaved = false;
    let lastFlushedLength = 0;

    // Shared by the final save (on close/exit) and the periodic live flush
    // below — appends one entry to agents/handoffs.md, capped so the file
    // (and what gets injected into the next agent) stays focused on recent
    // sessions instead of growing forever.
    const appendHandoffEntry = async (
      pheromoneInstance: Pheromone,
      dir: string,
      transcript: string,
      label: string,
    ) => withHandoffLock(dir, async () => {
      const dateStr = new Date().toISOString();
      // Strip TUI chrome / ANSI / spinner glyphs so the next agent never sees
      // glued Ink status lines ("forshortcuts…", checkerboard blocks, etc.).
      const handoffExcerpt = excerptForHandoff(transcript, 1200);
      if (!handoffExcerpt) return; // nothing readable — don't poison handoffs.md
      const handoffEntry = `\n## [${dateStr.split('T')[0]}] ${agent.cliName} (${agent.cli}) ${label}\n\nChars: ${transcript.length}\n\n### Session Excerpt (last ~1200 chars)\n\n${handoffExcerpt}\n`;

      let existingHandoff = "";
      try {
        const hf = await pheromoneInstance.readMemoryFile("agents/handoffs.md");
        existingHandoff = hf.content;
      } catch {}

      const handoffHeader = "# Handoffs\n\nWhat each agent left for the next one.\n";
      const priorBody = existingHandoff.includes("# Handoffs")
        ? existingHandoff.slice(existingHandoff.indexOf(handoffHeader) + handoffHeader.length)
        : existingHandoff;
      const cappedBody = (priorBody + handoffEntry).slice(-6000);
      await pheromoneInstance.writeMemoryFile("agents/handoffs.md", handoffHeader + cappedBody);
    });

    const saveSessionSummary = async (transcript: string) => {
      if (summarySaved) return;
      summarySaved = true;

      // Resolve the best available project dir — needed for Pheromone.create()
      let saveDir = spawnDir;
      if (!saveDir) {
        try { saveDir = await invoke<string>("get_project_path"); } catch {}
      }
      if (!saveDir) {
        try { saveDir = await invoke<string>("get_home_dir"); } catch {}
      }

      if (!saveDir) {
        console.warn(`[Pheromone] Cannot save session: no project dir available for ${paneId}`);
        return;
      }

      const sessionId = `session-${Date.now()}`;
      const cleanTranscript = transcript.trim();
      const dateStr = new Date().toISOString();
      console.log(`[Pheromone] Saving session ${sessionId} for ${agent.cliName} in ${saveDir} (${cleanTranscript.length} chars)`);

      try {
        const pheromoneInstance = await Pheromone.create(saveDir);

        // Step 1: Write the raw session log immediately (no AI dependency)
        const rawSessionContent = `# ${agent.cliName} Session Log\n\nDate: ${dateStr}\nAgent: ${agent.cli}\nProject: ${saveDir}\n\n## Raw Transcript\n\n\`\`\`\n${cleanTranscript || "(empty session)"}\n\`\`\`\n`;

        await pheromoneInstance.writeMemoryFile(
          `agents/sessions/${sessionId}.md`,
          rawSessionContent,
          { agent: agent.cli, timestamp: Date.now() }
        );
        console.log(`[Pheromone] ✓ Session log written: agents/sessions/${sessionId}.md`);

        // Step 1b: Update agents/handoffs.md — this is what the NEXT agent will always read.
        // It's compact (no full transcript) and always indexed on next pane spawn.
        await appendHandoffEntry(pheromoneInstance, saveDir, cleanTranscript, "(session ended)");
        console.log(`[Pheromone] ✓ Handoff written to agents/handoffs.md`);

        // Step 2: Optionally enrich with AI summary if transcript is substantial
        if (cleanTranscript.length >= 50) {
          generateAIExtractedSummary(cleanTranscript, agent.cliName, apiKeys).then(async (summary) => {
            if (!summary) return;
            try {
              // Overwrite the session file with enriched content
              const enrichedContent = `# ${agent.cliName} Session Summary\n\nDate: ${dateStr}\nAgent: ${agent.cli}\nProject: ${saveDir}\n\n## Changes\n\n${summary.changes.map((c: string) => `- ${c}`).join('\n')}\n\n## Decisions\n\n${summary.decisions.map((d: any) => `- [${d.type}] ${d.description}`).join('\n')}\n\n## Raw Transcript\n\n\`\`\`\n${cleanTranscript}\n\`\`\`\n`;
              await pheromoneInstance.writeMemoryFile(
                `agents/sessions/${sessionId}.md`,
                enrichedContent,
                { agent: agent.cli, timestamp: Date.now() }
              );

              // Append decisions to appropriate memory files
              for (const decision of summary.decisions) {
                let targetFile = 'memory/knowledge.md';
                if (decision.type === 'architecture') targetFile = 'memory/decisions.md';
                else if (decision.type === 'convention') targetFile = 'memory/conventions.md';
                else if (decision.type === 'bug_fix') targetFile = 'memory/bugs.md';

                let existingContent = "";
                try {
                  const fileData = await pheromoneInstance.readMemoryFile(targetFile);
                  existingContent = fileData.content;
                } catch {}

                await pheromoneInstance.writeMemoryFile(
                  targetFile,
                  existingContent + `\n## [${dateStr.split('T')[0]}] ${agent.cliName} Session\n\n${decision.description}\n`
                );
                console.log(`[Pheromone] ✓ Decision appended to ${targetFile}`);
              }
            } catch (e) {
              console.error("[Pheromone] Failed to enrich session with AI summary:", e);
            }
          }).catch(e => console.error("[Pheromone] AI summarization error:", e));
        }
      } catch (e) {
        console.error(`[Pheromone] Failed to save session log for ${paneId}:`, e);
      }
    };


    setSpawnState("connecting");
    setStalled(false);

    let spawned = false;
    // Last measured grid — used to tell that layout has stopped moving.
    let lastCols = 0;
    let lastRows = 0;
    // Last grid actually pushed to the pty, so an unchanged size costs nothing.
    let lastSyncedCols = 0;
    let lastSyncedRows = 0;

    const hasValidSize = () => {
      if (!terminalRef.current) return false;
      const rect = terminalRef.current.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    // Background loops for a live pty: the 10s handoff sync and the reader
    // that drains output into xterm. Started after a fresh spawn AND after a
    // reattach, so a pane that outlived its unmount keeps syncing and printing.
    let loopsStarted = false;
    // Output arrives pushed from Rust (`pty-output` events) instead of a
    // polled `read_from_terminal` — with several agent panes open, polling
    // every pane every 50ms was dozens of Tauri IPC round-trips/sec on one
    // channel, which is what caused multi-pane lag.
    const stopReadOutput = () => {
      unlistenOutput?.();
      unlistenOutput = null;
      if (aliveCheckInterval) {
        clearInterval(aliveCheckInterval);
        aliveCheckInterval = null;
      }
    };

    // MUST be awaited before spawn_terminal (or before trusting a reattach is
    // live): the Rust reader thread starts emitting the instant the pty exists,
    // and Tauri does not replay missed events to a listener that subscribes
    // late. Subscribing after spawn raced the CLI's own splash-screen burst —
    // it landed before this listener existed, was dropped, and the pane sat
    // silently "Starting..." forever with a live process behind it.
    const subscribeOutput = async () => {
      if (outputSubscribed || disposed) return;
      outputSubscribed = true;
      const fn = await listen<{ paneId: string; data: string }>("pty-output", (event) => {
        if (disposed || event.payload.paneId !== paneId || !terminal) return;
        const output = event.payload.data;
        if (!output) return;

        if (detectCommandNotFoundError(output, agent.cli)) {
          setSpawnState("notFound");
          invoke("kill_terminal", { paneId }).catch(console.error);
          if (stallTimer) {
            clearTimeout(stallTimer);
            stallTimer = null;
          }
          stopReadOutput();
          return;
        }

        // Append output to transcript ref, stripping color codes/non-printables where possible
        // to make the transcript clean for LLM consumption
        const cleanOutput = output.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
        transcriptRef.current = (transcriptRef.current + cleanOutput).slice(-50000);

        terminal.write(output);
        setSpawnState("running");
        setStalled(false);
        if (stallTimer) {
          clearTimeout(stallTimer);
          stallTimer = null;
        }
      });
      if (disposed) {
        fn();
        return;
      }
      unlistenOutput = fn;
    };

    const startLoops = () => {
      if (loopsStarted) return;
        loopsStarted = true;
      // Periodically snapshot the live transcript into agents/handoffs.md
      // (not just on close). AGENTS.md's v1 scope is one agent per pane —
      // but nothing stops a second Agent being opened alongside a
      // still-running one, and it should see reasonably fresh context
      // without forcing the user to close the first one first.
      // One flush routine, shared by the 10s auto-sync and the manual button.
      // `force` (manual) bypasses the "enough new output" threshold so the
      // user always gets an immediate push. Targets the SHARED agent mind
      // (sharedDirRef) so agents in different trees read each other's handoffs.
      const flushHandoff = async (force: boolean) => {
        const syncDir = sharedDirRef.current || spawnDir;
        if (disposed || !syncDir) return;
        const transcript = transcriptRef.current.trim();
        if (!force && transcript.length - lastFlushedLength < 200) return;
        if (!transcript) return;
        setSyncing(true);
        try {
          const pheromoneInstance = await Pheromone.create(syncDir);
          await appendHandoffEntry(pheromoneInstance, syncDir, transcript, force ? "(manual sync)" : "(in progress)");
          lastFlushedLength = transcript.length;
          setLastSync(Date.now());
        } catch (e) {
          console.warn(`[Pheromone] Handoff sync failed for ${paneId}:`, e);
        } finally {
          setSyncing(false);
        }
    };
      syncNowRef.current = () => flushHandoff(true);
      liveHandoffInterval = setInterval(() => flushHandoff(false), 10000);

      // Liveness is checked on its own slow interval, decoupled from output
      // delivery (was piggybacked on the old 50ms poll loop at a ~2s cadence;
      // kept at the same cadence, now on its own interval since there's no
      // poll loop to ride along with).
      aliveCheckInterval = setInterval(async () => {
        try {
          const alive = await invoke<boolean>("is_process_alive", { paneId });
          if (!alive) {
            console.log(`[AgentPane - ${paneId}] Process exited naturally. Saving session summary...`);
            saveSessionSummary(transcriptRef.current);
            stopReadOutput();
          }
        } catch (e) {
          console.error("is_process_alive check failed:", e);
        }
      }, 2000);
    };

    const spawnProcess = async () => {
      if (spawned || disposed || !terminal) return;
      spawned = true;

      // Subscribe before doing anything else that could let output start
      // flowing (a fresh spawn, or confirming a reattach's process is still
      // alive) — see subscribeOutput's own comment for why order matters here.
      await subscribeOutput();
      if (disposed || !terminal) return;

      // Reattaching, not starting: this pane's agent is still running (the pane
      // was hidden by a agent switch or moved to the Lead dock). Replay
      // what it had on screen and let the reader loop drain the rest.
      if (await isAlreadySpawned(paneId, workingDir)) {
        if (disposed || !terminal) return;
        const previous = takeTranscript(paneId);
        if (previous) {
          terminal.write(previous);
          transcriptRef.current = previous;
        }
        // The pty still has the PREVIOUS pane's width. Hand it this one before
        // draining output, or the agent wraps at the old column count and xterm
        // re-wraps on top of it.
        {
          fitAddonRef.current?.fit();
          const { rows, cols } = terminal;
          invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        }
        terminal.writeln(
          `\r\n\x1b[38;5;108m[swarm] reattached to the running ${agent.cliName}\x1b[0m`,
        );
        setSpawnState("running");
        startLoops();
        return;
      }

      if (!spawnDir) {
        // Default to home directory (not the app's own source dir).
        // If a project is open, workingDir overrides to that project folder.
        try {
          spawnDir = await invoke<string>("get_home_dir");
        } catch (e2) {
          console.error("Failed to get home directory:", e2);
        }
      }

      // For MCP-capable CLIs, write their config before spawning so the
      // Pheromone MCP server (with pheromone_query tool) is registered at boot.
      // `pheromoneBridge` records which memory path actually engaged so we can
      // (a) show a visible marker in the pane and (b) skip the redundant stdin
      // push when a real MCP/plugin path is active.
      let pheromoneBridge: PheromoneBridge = "stdin-fallback";
      if (spawnDir) {
        try {
          pheromoneBridge = await ensureMCPConfigForCLI(agent.cli, spawnDir);
        } catch (e) {
          console.error(`[Pheromone] MCP config FAILED for ${agent.cli} — pheromone will not appear in MCP list:`, e);
          pheromoneBridge = "stdin-fallback";
          if (!disposed && terminal) {
            terminal.writeln(
              `\x1b[31m[pheromone] MCP registration failed — ${String(e).slice(0, 200)}\x1b[0m`,
            );
          }
        }
        // Pre-accept Claude's "trust this folder" dialog (not covered by
        // --dangerously-skip-permissions). Safe no-op for other CLIs.
        await ensureCliWorkspaceTrust(agent.cli, spawnDir);
      }

      try {
        const command = agent.cli;
        // Always skip per-turn permission prompts for Agents (Claude/Codex/etc.).
        const args = withPermissionBypass(command, agent.args || []);
        const env = envForCli(command, apiKeys);
        // The MCP server this CLI spawns inherits these: they tell it whether to
        // advertise Lead's orchestration tools, and which pane is asking.
        env.SWARM_PANE_ID = paneId;
        // So messages on the swarm bus read "Builder said…", not a pane id.
        env.SWARM_SWARM_NAME = displayName;
        if (leadRef.current.isLead) env.SWARM_LEAD = "1";
        // Re-fit right before spawn, not just back when fitAndSync first
        // decided the size looked stable: ensureMCPConfigForCLI and
        // ensureCliWorkspaceTrust above are awaited file I/O, and if the grid
        // is still settling (e.g. a sibling pane finishing its own layout
        // pass) during that gap, terminal.cols read without one more fit()
        // here is stale — the CLI then draws its welcome box for a column
        // count wider than the pane actually ended up, and it stays clipped.
        if (disposed || !terminal) return;
        fitAddonRef.current?.fit();
        const { rows, cols } = terminal;

        await invoke("spawn_terminal", {
          paneId,
          command,
          args,
          workingDir: spawnDir,
          env,
          rows,
          cols,
        });
        markSpawned(paneId, workingDir);

        if (disposed || !terminal) return;

        // Deliberately NOT "running" yet. spawn_terminal returning only means
        // the pty exists; the CLI has drawn nothing. Flipping state here tore
        // the "Starting…" overlay down over an empty black rectangle and, worse,
        // made the stall hint below unreachable — the old guard compared against
        // a `spawnState` captured when this long-lived effect was created, so it
        // never matched. The first byte of pty output is the honest signal, and
        // it is what cancels this timer.
        setStalled(false);
        stallTimer = setTimeout(() => {
          if (!disposed) setStalled(true);
        }, STALL_HINT_MS);

        startLoops();

        // Visible marker: show which Pheromone memory bridge is live for this
        // pane, so testing doesn't require reading code or the devtools console.
        if (!disposed && terminal) {
          const bridgeLabel =
            pheromoneBridge === "mcp-plugin"
              ? "MCP PLUGIN (agy pheromone_query, opt-in)"
              : pheromoneBridge === "mcp"
                ? "MCP (pheromone_query tool)"
                : "stdin fallback (boot-time injection)";
          terminal.writeln(
            `\x1b[38;5;108m[pheromone] memory bridge: ${bridgeLabel}\x1b[0m`,
          );
          console.log(`[Pheromone] bridge for ${agent.cli} (${paneId}): ${pheromoneBridge}`);
        }

        // Memory tip: NEVER dump handoff transcripts into interactive TUI CLIs
        // (Claude Code / Codex / OpenCode / …). Those handoffs often contain
        // prior ConPTY/Ink chrome which shows up as "weird strings" in the
        // prompt. MCP-capable CLIs already have pheromone_query — we only paint a
        // local xterm marker (not stdin). Stdin-fallback gets a short clean
        // pointer to `.pheromone/` files, never raw transcript paste.
        if (spawnDir) {
          (async () => {
            try {
              await new Promise((resolve) => setTimeout(resolve, 2500));
              if (disposed || !terminal) return;

              // The crown carries a charter, but it is NEVER typed into the CLI:
              // a 1.5k-char blob pasted into an Ink prompt is unreadable noise
              // and burns a turn. It is published to .pheromone/lead/ROLE.md and
              // the agent fetches it with the lead_role MCP tool.
              if (leadRef.current.isLead) {
                agentsHost().publishLeadRole(
                  sharedDirRef.current || spawnDir,
                  leadRef.current.mode,
                );
                terminal.writeln(
                  `\x1b[38;5;178m[lead] crowned as ${leadRef.current.mode} — call lead_role for your charter\x1b[0m`,
                );
              }

              const openFiles = agentsHost().openFilesFor(sharedDirRef.current || spawnDir);
              const openFilesHint =
                openFiles.length > 0
                  ? ` Open files: ${openFiles.slice(0, 12).join(", ")}.`
                  : "";

              if (pheromoneBridge === "mcp" || pheromoneBridge === "mcp-plugin") {
                if (!disposed && terminal) {
                  terminal.writeln(
                    `\x1b[38;5;178m[pheromone] ready — use pheromone_query for project memory` +
                      `${openFiles.length ? ` (${openFiles.length} open files tracked)` : ""}\x1b[0m`,
                  );
                }
                // Do not writeToProcess — submitting a tip as a fake user turn
                // pollutes Claude/Codex/OpenCode chat and can land mid-wizard.
                console.log(`[Pheromone] MCP bridge live for ${paneId}; skipped stdin injection`);
                return;
              }

              // MCP-capable CLIs (Claude Code, Kilo, Codex, OpenCode, …) NEVER get
              // stdin text — not even when their MCP config failed to write. A
              // blob pasted into an Ink prompt is noise the user has to clear by
              // hand; they have pheromone_query instead.
              if (MCP_CAPABLE_CLIS.includes(agent.cli)) {
                if (!disposed && terminal) {
                  terminal.writeln(
                    `[38;5;178m[pheromone] memory available via pheromone_query (no prompt injection)[0m`,
                  );
                }
                return;
              }

              // Stdin-fallback only: short, sanitized pointer. Never paste handoffs.md.
              let ctxLine =
                "[Swarm Pheromone] Read .pheromone/agents/handoffs.md and .pheromone/memory/ for shared project context.";
              if (openFilesHint) ctxLine += openFilesHint;

              // If a clean handoff excerpt exists, append a tiny summary — skip garbage.
              try {
                const pheromone = await Pheromone.create(sharedDirRef.current || spawnDir!);
                const hf = await pheromone.readMemoryFile("agents/handoffs.md");
                if (isMeaningfulChunk(hf.content)) {
                  const clean = flattenForStdin(excerptForHandoff(hf.content, 400));
                  if (clean && !looksLikeTerminalGarbage(clean)) {
                    ctxLine += ` Recent handoff: ${clean}`;
                  }
                }
              } catch {
                // first session / no handoff
              }

              if (!disposed && terminal) {
                terminal.writeln(
                  `\x1b[38;5;178m[pheromone] injecting memory pointer for ${agent.cliName}\x1b[0m`,
                );
              }
              writeToProcess(flattenForStdin(ctxLine) + "\n");
              console.log(`[Pheromone] Injected stdin pointer (${ctxLine.length} chars) into ${paneId}`);
            } catch (e) {
              console.error("Pheromone injection failed:", e);
            }
          })();
        }
      } catch (e) {
        if (isNotFoundError(e)) {
          // Don't write anything to the xterm buffer — show the install UI instead.
          if (!disposed) setSpawnState("notFound");
        } else {
          if (!disposed && terminal) {
            terminal.writeln(`\x1b[31mFailed to spawn ${displayName}: ${e}\x1b[0m`);
          }
          if (!disposed) setSpawnState("error");
        }
      }
    };

    const initTerminal = () => {
      try {
        const options: ITerminalOptions = {
          cursorBlink: true,
          cursorStyle: "block",
          fontSize: getFontSize(),
          fontFamily: '"Geist Mono", Cascadia Code, Consolas, monospace',
          fontWeight: "400",
          fontWeightBold: "700",
          // 1 (xterm's own default), not >1: box-drawing glyphs and background
          // colour fills (a CLI's welcome-box border, its logo blocks) are
          // drawn to fill exactly a 1.0 cell. Stretching the row taller than
          // that leaves a gap between lines that isn't part of any cell — box
          // borders look disconnected and solid-colour blocks look seamed.
          lineHeight: 1,
          theme: paneXtermTheme(),
          // Opaque on purpose — see paneXtermTheme. Transparency here forced
          // xterm onto its alpha-blending path and locked out the GPU renderer.
          allowTransparency: false,
          rightClickSelectsWord: true,
          scrollback: 2000,
        };

        terminal = new XTerm(options);
        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        fitAddonRef.current = fitAddon;

        // Ctrl+C handling for Agents. This must NEVER close the pane —
        // only the header close button removes a Agent. So we fully own the
        // Ctrl+C keystroke here and stop it from bubbling to any window-level
        // shortcut handler:
        //   * With a selection -> copy to clipboard (like a normal terminal).
        //   * Without a selection -> send SIGINT (\x03) to the child process.
        // Either way we swallow the event (preventDefault + stopPropagation)
        // and return false so xterm does no further default handling.
        terminal.attachCustomKeyEventHandler((arg) => {
          if (arg.ctrlKey && !arg.altKey && !arg.metaKey && arg.code === "KeyC") {
            if (arg.type === "keydown") {
              const selection = terminal?.getSelection();
              if (selection) {
                navigator.clipboard.writeText(selection).catch(() => {});
              } else {
                writeToProcess("\x03"); // SIGINT to the CLI agent, not the pane
              }
            }
            // Stop the browser/window from ever seeing this Ctrl+C so it can't
            // trigger a global "close" shortcut.
            arg.preventDefault();
            arg.stopPropagation();
            return false;
          }
          return true;
        });

        terminal.open(terminalRef.current!);
        terminalInstance.current = terminal;

        // GPU renderer. The DOM/canvas fallback rasterises every glyph on the
        // CPU and repaints the whole viewport as a busy CLI scrolls — that is
        // the soft, smeary text and the stutter under load. Must come after
        // open(): the addon needs a live canvas to attach to. Some VMs and
        // remote sessions have no GL context at all, and both the constructor
        // (old Safari) and activation (no WebGL2) throw — a pane that renders
        // slowly is fine, a pane that throws on mount is not.
        try {
          const webgl = new WebglAddon();
          terminal.loadAddon(webgl);
          webglAddon = webgl;
          webglRef.current = webgl;
          // The GPU drops the context on sleep/wake and driver resets. xterm
          // does not recover on its own: without tearing the addon down here
          // the pane stays permanently blank until it is closed and reopened.
          webgl.onContextLoss(() => {
            if (webglAddon === webgl) webglAddon = null;
            if (webglRef.current === webgl) webglRef.current = null;
            try {
              webgl.dispose();
            } catch {}
            // dispose() hands rendering back to the DOM renderer, but only the
            // rows xterm redraws next — force the visible ones now.
            try {
              terminal?.refresh(0, (terminal.rows ?? 1) - 1);
            } catch {}
          });
        } catch (e) {
          console.warn("[AgentPane] WebGL renderer unavailable, using fallback:", e);
        }

        const fit = () => {
          if (disposed || !terminal) return false;
          try {
            fitAddon.fit();
            return true;
          } catch (e) {
            console.warn("[AgentPane] fit() failed:", e);
            return false;
          }
        };
        const syncSize = () => {
          if (disposed || !terminal) return;
          const { rows, cols } = terminal;
          // fit() runs on every tick but usually lands on the same grid; a pty
          // resize for an unchanged size is a pure IPC round-trip AND makes
          // the child redraw, so with several panes open it was the bulk of
          // the resize cost for no visible effect.
          if (rows === lastSyncedRows && cols === lastSyncedCols) return;
          lastSyncedRows = rows;
          lastSyncedCols = cols;
          invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        };

        const fitAndSync = () => {
          if (resizeDebounce) clearTimeout(resizeDebounce);
          // Pre-spawn this debounce is the settle window the two-equal-
          // measurements check below rides on, so it stays long. Once the pty
          // exists the tick is only fit + a deduped resize, and 150ms of it was
          // what made a drag feel sticky.
          resizeDebounce = setTimeout(() => {
            if (disposed || !terminal) return;
            if (hasValidSize()) {
              if (fit()) {
                if (!spawned) {
                  // A CLI prints its welcome box at whatever width the pty had
                  // when it started, and nothing re-wraps it afterwards — a
                  // resize_terminal after the fact fixes future output, not the
                  // box already drawn. Spawning on the very first non-zero
                  // measurement bakes in a half-settled grid layout (the
                  // misaligned-border bug). Wait until two measurements agree.
                  const { rows, cols } = terminal;
                  if (cols !== lastCols || rows !== lastRows) {
                    lastCols = cols;
                    lastRows = rows;
                    fitAndSync();
                    return;
                  }
                  spawnProcess();
                } else {
                  syncSize();
                }
              }
            }
          }, spawned ? 40 : 150);
        };

        onDataDisposable = terminal.onData((data) => {
          writeToProcess(data);
        });

        // One shared window listener for every pane instead of one each — see
        // paneResize. The pane's own ResizeObserver stays: that is this
        // container's geometry (grid reflow, sibling pane resize, maximize),
        // which no window event reports. Both funnel into the same debounced
        // fitAndSync, so a window resize that also moves this container
        // collapses into a single fit rather than firing twice.
        unsubscribeResize = onWindowResize(fitAndSync);

        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            // Rounded: sub-pixel container widths would re-render the header on
            // every frame of a drag while never crossing a layout threshold.
            setPaneWidth(Math.round(entry.contentRect.width));
          }
          fitAndSync();
        });
        resizeObserver.observe(terminalRef.current!);
        observerRef = resizeObserver;

        fitAndSync();
      } catch (e) {
        console.error("Failed to initialize Agent pane:", e);
      }
    };

    initTerminal();

    return () => {
      disposed = true;
      if (stallTimer) clearTimeout(stallTimer);
      if (resizeDebounce) clearTimeout(resizeDebounce);
      if (liveHandoffInterval) clearInterval(liveHandoffInterval);
      if (aliveCheckInterval) clearInterval(aliveCheckInterval);
      unlistenOutput?.();
      syncNowRef.current = null;
      unsubscribeResize?.();
      observerRef?.disconnect();
      onDataDisposable?.dispose();

      // Keep the scrollback so a remount (agent switch, crowning) can put
      // the user back where they were instead of facing a blank pane.
      saveTranscript(paneId, transcriptRef.current);

      // Only summarize on a REAL close. This unmount also fires on a plain
      // remount (agent switch, crowning) where the pty lives on and gets
      // reattached — forgetSpawn() only runs on an actual close (PlaneHost's
      // handleRemove), so if the pane is still tracked here the agent is
      // still running and this isn't the end of its session.
      if (!isTrackedAsSpawned(paneId)) {
        saveSessionSummary(transcriptRef.current);
      }

      // Before the terminal: the addon holds a GL context and a texture atlas,
      // and disposing it out from under a half-torn-down terminal is what makes
      // xterm's own disposal throw. It can also already be gone (context loss),
      // hence the guard.
      try {
        webglRef.current = null;
        webglAddon?.dispose();
        webglAddon = null;
      } catch (e) {
        console.warn("[AgentPane] Failed to dispose WebGL addon:", e);
      }

      try {
        terminal?.dispose();
      } catch (e) {
        console.warn("[AgentPane] Failed to dispose terminal:", e);
      } finally {
        terminalInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, agent.cli, workingDir]);

  useEffect(() => {
    const onTheme = () => {
      const t = terminalInstance.current;
      if (!t) return;
      // paneXtermTheme, not the raw helper: the helper's transparent background
      // would leave the terminal painted in the previous theme's canvas colour
      // (nothing else repaints that rectangle) the moment a theme switches.
      t.options.theme = paneXtermTheme();
      try {
        // The GPU renderer caches rasterised glyphs per colour; without
        // dropping the atlas the old theme's text keeps being blitted.
        webglRef.current?.clearTextureAtlas();
        t.refresh(0, t.rows - 1);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, onTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onTheme);
  }, []);

  const handleCopy = () => {
    const selection = terminalInstance.current?.getSelection();
    if (selection) navigator.clipboard.writeText(selection);
  };

  const handleClear = () => {
    terminalInstance.current?.clear();
  };

  // Narrow panes used to simply drop these three buttons, so "clear terminal"
  // stopped existing instead of getting smaller. They fold into one overflow
  // button below that threshold.
  const viewActions: Array<{ key: string; icon: React.ReactNode; label: string; run: () => void }> = [
    ...(onToggleMaximize
      ? [{
          key: "maximize",
          icon: isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />,
          label: isMaximized ? "Restore" : "Maximize",
          run: onToggleMaximize,
        }]
      : []),
    { key: "copy", icon: <Copy size={12} />, label: "Copy selection", run: handleCopy },
    { key: "clear", icon: <Eraser size={12} />, label: "Clear terminal", run: handleClear },
  ];

  return (
    <div className="flex flex-col h-full glass-body overflow-hidden">
      {/* Neutral chrome — class identity is the leading accent dot only. */}
      <div data-pane-drag data-pane-header="true" className={`${PANE_HEADER_CLASS} justify-between`}>
        <div className="flex items-center gap-2 min-w-0">
          {isEditing && onEditChange ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename?.();
                if (e.key === "Escape") onCancelRename?.();
              }}
              onClick={(e) => e.stopPropagation()}
              className="glass-inset text-swarm-text px-2 py-0.5 rounded-md text-xs w-32 focus:outline-none focus:ring-1 focus:ring-swarm-gold"
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={onRename}
              className="flex items-center gap-1.5 text-xs text-swarm-text font-medium cursor-pointer hover:text-swarm-goldHi transition-colors truncate"
            >
              {/* The dot means CLI agent, always — it is the one place a pane
                  states its class, so status must never repaint it. Starting
                  pulses; a failed spawn keeps the class colour and takes a red
                  halo instead. Shown at every width for the same reason. */}
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  spawnState === "connecting" ? "animate-pulse" : ""
                }`}
                style={{
                  background: themeForKind("agent").accent,
                  boxShadow:
                    spawnState === "error"
                      ? "0 0 0 2px rgba(198, 107, 90, 0.85)"
                      : undefined,
                }}
                title={
                  spawnState === "error"
                    ? "CLI agent — failed to start"
                    : spawnState === "connecting"
                      ? "CLI agent — starting…"
                      : "CLI agent — running"
                }
              />
              {agent.role && (
                <RoleBadge role={agent.role} branchName={agent.branchName} />
              )}
              <span className="truncate">{displayName}</span>
              {/* What this swarm was summoned on, when the caller pinned it. */}
              {(agent.model || agent.effort) && paneWidth >= 300 && (
                <span
                  className="shrink-0 rounded border border-swarm-border/60 px-1 py-px text-micro font-medium text-swarm-textMuted"
                  title={`Running ${agent.model ?? "the CLI default"}${agent.effort ? ` at ${agent.effort} effort` : ""}`}
                >
                  {[agent.model, agent.effort].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          )}
          {headerExtra}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isLead) demoteLead(agent.workspaceId ?? "");
              else promoteToLead(agent.id);
            }}
            disabled={leadTaken}
            className={`p-1.5 rounded-md transition-colors ${
              isLead
                ? "text-swarm-goldHi bg-swarm-gold/20"
                : leadTaken
                  ? "text-swarm-textMuted/40 cursor-not-allowed"
                  : "text-swarm-textDim hover:bg-swarm-border/60 hover:text-swarm-gold"
            }`}
            title={
              isLead
                ? "Demote from Lead — returns this agent to the grid"
                : leadTaken
                  ? "This folder already has a Lead — demote it first"
                  : "Make Lead — moves this agent to the Lead tab"
            }
          >
            <LeadCrown size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); syncNowRef.current?.(); }}
            disabled={syncing}
            className={`p-1.5 rounded-md transition-colors disabled:cursor-default ${
              syncing ? "text-swarm-gold" : "text-swarm-textDim hover:bg-swarm-border/60 hover:text-swarm-text"
            }`}
            title={
              syncing
                ? "Syncing to shared mind…"
                : lastSync
                  ? `Sync to shared mind (last: ${new Date(lastSync).toLocaleTimeString()})`
                  : "Sync to shared mind (auto every 10s)"
            }
          >
            <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
          </button>
          {/* Hairline between "what this agent IS" (crown, shared-mind sync)
              and "what this pane DOES" (view controls). Six identically styled
              icons in one undivided row read as a single blob when you're
              scanning a grid of panes for the right one. */}
          <span aria-hidden className="mx-0.5 h-3.5 w-px bg-swarm-border/70" />
          {compactHeader ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                }}
                className={`p-1.5 rounded-md transition-colors ${
                  menuOpen
                    ? "bg-swarm-border/60 text-swarm-text"
                    : "text-swarm-textDim hover:bg-swarm-border/60 hover:text-swarm-text"
                }`}
                title="More actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal size={12} />
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  // The header is the pane's drag handle; a mousedown on the
                  // menu's own padding would otherwise start dragging the pane
                  // out from under the click.
                  onMouseDown={(e) => e.stopPropagation()}
                  className="glass-hi absolute right-0 top-full z-30 mt-1 min-w-[9.5rem] rounded-lg border border-swarm-border/60 p-1 shadow-glass"
                >
                  {viewActions.map((action) => (
                    <button
                      key={action.key}
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        action.run();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-swarm-textDim hover:bg-swarm-border/60 hover:text-swarm-text transition-colors"
                    >
                      {action.icon}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            viewActions.map((action) => (
              <button
                key={action.key}
                onClick={(e) => {
                  e.stopPropagation();
                  action.run();
                }}
                className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textDim hover:text-swarm-text transition-colors"
                title={action.label}
              >
                {action.icon}
              </button>
            ))
          )}
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 rounded-md text-swarm-textDim hover:bg-swarm-err/25 hover:text-swarm-err transition-colors"
              title="Delete Agent"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* terminal content — bg matches the xterm theme so the whole-cell fit
          remainder on the right/bottom blends in instead of showing a strip. */}
      <div
        className="flex-1 overflow-hidden relative min-h-0 p-2"
        style={{ contain: "layout paint", background: "rgb(var(--swarm-canvas-hi))" }}
      >
        {/* xterm canvas — hidden (not unmounted) when CLI isn't installed */}
        <div
          ref={terminalRef}
          className={`absolute inset-2 overflow-hidden ${spawnState === "notFound" ? "invisible" : ""}`}
        />

        {/* CLI not found — rich install card, replaces xterm entirely */}
        {spawnState === "notFound" && (
          <CLINotFoundCard
            cli={agent.cli}
            cliName={agent.cliName}
            onClose={onClose}
          />
        )}

        {/* Loading / generic error overlay */}
        {spawnState !== "running" && spawnState !== "notFound" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none glass-inset backdrop-blur-[2px] animate-fade-in px-4 text-center">
            {spawnState === "error" ? (
              <>
                <AlertTriangle size={18} className="text-swarm-err" />
                <span className="text-xs text-swarm-textDim">
                  {displayName} failed to start
                </span>
              </>
            ) : (
              <>
                <Loader2 size={18} className="text-swarm-gold animate-spin" />
                <span className="text-xs text-swarm-textMuted">
                  Starting {displayName}…
                </span>
                {stalled && (
                  <span className="text-mini text-swarm-warn max-w-[220px]">
                    Still nothing after {STALL_HINT_MS / 1000}s — is{" "}
                    <code className="font-mono">{agent.cli}</code> installed
                    and on your PATH?
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ExtractedSummary {
  changes: string[];
  decisions: Array<{
    type: 'architecture' | 'convention' | 'bug_fix' | 'general';
    description: string;
  }>;
}

async function generateAIExtractedSummary(
  transcript: string,
  cliName: string,
  apiKeys: any
): Promise<ExtractedSummary | null> {
  const prompt = `Analyze this raw command line coding session transcript for the AI assistant "${cliName}".
Extract:
1. Any specific code or project changes made (e.g. file edits, additions, deletions).
2. Any major decisions made, categorized into:
   - "architecture" (e.g., system design choices, libraries, module boundaries)
   - "convention" (e.g., style guidelines, patterns, naming choices)
   - "bug_fix" (e.g., fixed unique constraint in db, fixed type errors)
   - "general" (e.g., other project knowledge learned)

Respond ONLY with a JSON object of this structure, without markdown formatting or code blocks:
{
  "changes": ["string"],
  "decisions": [
    {
      "type": "architecture" | "convention" | "bug_fix" | "general",
      "description": "string"
    }
  ]
}

Transcript:
${transcript}`;

  // Try Google Gemini
  if (apiKeys.google) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeys.google}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return JSON.parse(text);
    } catch (e) {
      console.warn("Gemini summarization failed, trying next provider:", e);
    }
  }

  // Try OpenAI
  if (apiKeys.openai) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKeys.openai}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return JSON.parse(text);
    } catch (e) {
      console.warn("OpenAI summarization failed:", e);
    }
  }

  // Offline keyword-based extraction (AGENTS.md §4.2.6 — no AI dependency).
  // Scans the transcript for patterns that indicate bug fixes, architecture
  // decisions, conventions, or general knowledge, and routes each to the
  // correct memory file.  This runs even when no LLM API key is configured.
  const changes: string[] = [];
  const decisions: Array<{
    type: 'architecture' | 'convention' | 'bug_fix' | 'general';
    description: string;
  }> = [];
  const seen = new Set<string>();

  const lines = transcript.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 15) continue;

    // Bug fixes
    if (/\b(bug|fix|error|crash|panic|exception|hotfix|regression)\b/i.test(t) &&
        /(file|function|method|class|route|query|mutation|type|import|export|config|test|spec)/i.test(t)) {
      const key = `bug:${t.slice(0, 80)}`;
      if (!seen.has(key)) { seen.add(key); decisions.push({ type: 'bug_fix', description: t.slice(0, 200) }); }
    }
    // Architecture decisions
    if (/\b(decided|chose|architect|refactor|restructur|migrat|move\s+to|switch\s+to|replac|extract|split|merge|rename)\b/i.test(t) &&
        !/\b(bug|fix|error)\b/i.test(t)) {
      const key = `arch:${t.slice(0, 80)}`;
      if (!seen.has(key)) { seen.add(key); decisions.push({ type: 'architecture', description: t.slice(0, 200) }); }
    }
    // Conventions / patterns
    if (/\b(convention|style|naming|pattern|standard|guideline|format|lint|prettier|eslint)\b/i.test(t)) {
      const key = `conv:${t.slice(0, 80)}`;
      if (!seen.has(key)) { seen.add(key); decisions.push({ type: 'convention', description: t.slice(0, 200) }); }
    }
    // File-level changes (git-style)
    if (/^(created|modified|updated|deleted|renamed|added|changed|removed)\s+\S+\.\w+/i.test(t)) {
      changes.push(t);
    }
  }

  return {
    changes: changes.length > 0 ? [...new Set(changes)].slice(0, 10) : ["Session completed."],
    decisions: decisions.length > 0 ? decisions.slice(0, 10) : [{ type: 'general', description: "Session transcript available in agents/sessions/ for manual review." }]
  };
}
