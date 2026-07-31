"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, ITerminalOptions } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { SearchAddon } from "xterm-addon-search";
import {
  Copy,
  Trash2,
  Eraser,
  Maximize2,
  Minimize2,
  Loader2,
  AlertTriangle,
  Download,
  ExternalLink,
  Terminal,
  Check,
  RefreshCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { BrandGlyph, cliBrand, WorkerBeeMark } from "@hiveory/honeyboard";
import { envForCli } from "../cli-configs/env.js";
import { workerBeesHost } from "./host.js";
import { useWorkerBeesStore } from "./workerBeesStore.js";
import { TauriNectar as Nectar } from "@hiveory/nectar/tauri";
import { withPermissionBypass, MCP_CAPABLE_CLIS } from "../cli-configs/index.js";
import { CLI_BY_COMMAND } from "../index.js";
import { ensureMCPConfigForCLI, type NectarBridge } from "./ensureMcpConfig.js";
import { ensureCliWorkspaceTrust } from "./ensureWorkspaceTrust.js";
import { excerptForHandoff, looksLikeTerminalGarbage, stripTerminalNoise } from "./sanitizeHandoff.js";
import { isAlreadySpawned, isTrackedAsSpawned, markSpawned, saveTranscript, takeTranscript } from "./spawnGuard.js";
import { withHandoffLock } from "./handoffQueue.js";
import RoleBadge from "./RoleBadge.js";
import { QueenCrown } from "@hiveory/honeyboard";
import { PANE_HEADER_CLASS, themeForKind } from "@hiveory/honeyboard";
import type { QueenBeeMode } from "@hiveory/queenbee";
import {
  THEME_CHANGE_EVENT,
  buildXtermThemeFromDom,
} from "./themeColors.js";

// A WorkerBee pane is a CLI agent process (Claude Code, Codex CLI, Aider,
// Gemini CLI, OpenCode, Kimi Code, Cline, ...) — a fundamentally different
// thing from a plain shell terminal (see components/terminal/TerminalPane).
// It's wired to inject Nectar project memory and pass provider API keys, and
// it has no concept of "which shell" — it's always exactly one CLI command.
export interface WorkerBeeInfo {
  id: string;
  cli: string;
  cliName: string;
  customName?: string;
  args?: string[];
  role?: string;
  branchName?: string;
  /** Which workhive (folder) this pane belongs to — see workerBeesStore. */
  workHiveId?: string;
  /** Set while this bee wears the crown — see workerBeesStore. */
  isQueen?: boolean;
  queenMode?: QueenBeeMode;
  /** Model / effort this bee was summoned with, when pinned. */
  model?: string;
  effort?: string;
}

interface WorkerBeePaneProps {
  paneId: string;
  workingDir?: string | null;
  workerBee: WorkerBeeInfo;
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
  /** Shared workhive mind: the dir whose .nectar all agents sync into (the
   *  workhive root), so agents in different trees see each other's handoffs.
   *  Falls back to the pane's own working dir when absent. */
  sharedMemoryDir?: string | null;
}

// How long to wait with zero output before hinting that the CLI might not be
// installed, rather than leaving the user staring at an ambiguous spinner.
const STALL_HINT_MS = 8000;

// CLI install instructions — imported from @hiveory/worker-bees which is the
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
        <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center text-bee-gold shadow-glass">
          {cliBrand(info?.id) ? <BrandGlyph brand={cliBrand(info?.id)!} size={24} /> : <WorkerBeeMark size={24} />}
        </div>
        <div>
          <p className="text-sm font-semibold text-bee-text">
            {info?.name ?? cliName} not installed
          </p>
          <p className="text-mini text-bee-textMuted mt-0.5">
            {info?.description ?? `Could not find \`${cli}\` on PATH`}
          </p>
        </div>
      </div>

      {/* Install command */}
      {info && (
        <div className="w-full max-w-[340px] space-y-2">
          <p className="text-mini text-bee-textDim uppercase tracking-wide font-semibold">
            Install command
          </p>
          <div className="relative rounded-xl glass border border-bee-border/70 overflow-hidden">
            <pre className="text-mini font-mono text-bee-gold px-3 py-2.5 pr-10 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {info.installCmd}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 p-1.5 rounded-md bg-bee-border/40 hover:bg-bee-gold/20 text-bee-textDim hover:text-bee-gold transition-all"
              title="Copy install command"
            >
              {copied ? (
                <Check size={11} className="text-bee-gold" />
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-bee-gold/10 border border-bee-gold/25 text-bee-goldHi hover:bg-bee-gold/20 transition-colors"
          >
            <ExternalLink size={12} />
            Open docs
          </a>
        )}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs glass border border-bee-border/70 text-bee-textDim hover:text-bee-text transition-colors"
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

export default function WorkerBeePane({
  paneId,
  workingDir,
  workerBee,
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
}: WorkerBeePaneProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  // Manual/auto sync of this agent's transcript into the shared workhive mind.
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  // Set inside the terminal effect so the header button can trigger a sync now.
  const syncNowRef = useRef<null | (() => Promise<void>)>(null);
  // Keep the latest shared-dir in a ref so the long-lived effect always syncs
  // to the current workhive root without re-running (which would respawn).
  const sharedDirRef = useRef<string | null | undefined>(sharedMemoryDir);
  sharedDirRef.current = sharedMemoryDir;
  const terminalInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [spawnState, setSpawnState] = useState<"connecting" | "running" | "error" | "notFound">("connecting");
  const [stalled, setStalled] = useState(false);
  // Keys come from the host (the app owns settings); the CLI-to-env mapping
  // is this package's own business — see cli-configs/env.
  const apiKeys = workerBeesHost().apiKeys();

  const [paneWidth, setPaneWidth] = useState(0);
  const [paneHeight, setPaneHeight] = useState(0);
  const refitCount = useWorkerBeesStore((s) => s.refitCount);

  // Crown state — one QueenBee per workhive, so this only looks at the bees
  // of this pane's own folder.
  const queenId = useWorkerBeesStore(
    (s) => s.workerBees.find((b) => b.isQueen && b.workHiveId === workerBee.workHiveId)?.id ?? null,
  );
  const promoteToQueen = useWorkerBeesStore((s) => s.promoteToQueen);
  const demoteQueen = useWorkerBeesStore((s) => s.demoteQueen);
  const isQueen = queenId === workerBee.id;
  const queenTaken = queenId !== null && !isQueen;
  // The spawn effect is long-lived; read the crown through a ref so promoting
  // never re-runs it (and so the boot injection sees the current role).
  const queenRef = useRef<{ isQueen: boolean; mode: QueenBeeMode }>({
    isQueen, mode: workerBee.queenMode ?? "Steward",
  });
  queenRef.current = { isQueen, mode: workerBee.queenMode ?? "Steward" };

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
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
          const { rows, cols } = terminalInstance.current;
          invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        } catch (e) {
          console.warn("Failed to refit terminal after font size change:", e);
        }
      }
    }
  }, [fontSize, paneId]);

  const displayName = workerBee.customName || workerBee.cliName;

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
    let handleResize: (() => void) | null = null;
    let observerRef: ResizeObserver | null = null;
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
      nectarInstance: Nectar,
      dir: string,
      transcript: string,
      label: string,
    ) => withHandoffLock(dir, async () => {
      const dateStr = new Date().toISOString();
      // Strip TUI chrome / ANSI / spinner glyphs so the next agent never sees
      // glued Ink status lines ("forshortcuts…", checkerboard blocks, etc.).
      const handoffExcerpt = excerptForHandoff(transcript, 1200);
      if (!handoffExcerpt) return; // nothing readable — don't poison handoffs.md
      const handoffEntry = `\n## [${dateStr.split('T')[0]}] ${workerBee.cliName} (${workerBee.cli}) ${label}\n\nChars: ${transcript.length}\n\n### Session Excerpt (last ~1200 chars)\n\n${handoffExcerpt}\n`;

      let existingHandoff = "";
      try {
        const hf = await nectarInstance.readMemoryFile("agents/handoffs.md");
        existingHandoff = hf.content;
      } catch {}

      const handoffHeader = "# Handoffs\n\nWhat each agent left for the next one.\n";
      const priorBody = existingHandoff.includes("# Handoffs")
        ? existingHandoff.slice(existingHandoff.indexOf(handoffHeader) + handoffHeader.length)
        : existingHandoff;
      const cappedBody = (priorBody + handoffEntry).slice(-6000);
      await nectarInstance.writeMemoryFile("agents/handoffs.md", handoffHeader + cappedBody);
    });

    const saveSessionSummary = async (transcript: string) => {
      if (summarySaved) return;
      summarySaved = true;

      // Resolve the best available project dir — needed for Nectar.create()
      let saveDir = spawnDir;
      if (!saveDir) {
        try { saveDir = await invoke<string>("get_project_path"); } catch {}
      }
      if (!saveDir) {
        try { saveDir = await invoke<string>("get_home_dir"); } catch {}
      }

      if (!saveDir) {
        console.warn(`[Nectar] Cannot save session: no project dir available for ${paneId}`);
        return;
      }

      const sessionId = `session-${Date.now()}`;
      const cleanTranscript = transcript.trim();
      const dateStr = new Date().toISOString();
      console.log(`[Nectar] Saving session ${sessionId} for ${workerBee.cliName} in ${saveDir} (${cleanTranscript.length} chars)`);

      try {
        const nectarInstance = await Nectar.create(saveDir);

        // Step 1: Write the raw session log immediately (no AI dependency)
        const rawSessionContent = `# ${workerBee.cliName} Session Log\n\nDate: ${dateStr}\nAgent: ${workerBee.cli}\nProject: ${saveDir}\n\n## Raw Transcript\n\n\`\`\`\n${cleanTranscript || "(empty session)"}\n\`\`\`\n`;

        await nectarInstance.writeMemoryFile(
          `agents/sessions/${sessionId}.md`,
          rawSessionContent,
          { agent: workerBee.cli, timestamp: Date.now() }
        );
        console.log(`[Nectar] ✓ Session log written: agents/sessions/${sessionId}.md`);

        // Step 1b: Update agents/handoffs.md — this is what the NEXT agent will always read.
        // It's compact (no full transcript) and always indexed on next pane spawn.
        await appendHandoffEntry(nectarInstance, saveDir, cleanTranscript, "(session ended)");
        console.log(`[Nectar] ✓ Handoff written to agents/handoffs.md`);

        // Step 2: Optionally enrich with AI summary if transcript is substantial
        if (cleanTranscript.length >= 50) {
          generateAIExtractedSummary(cleanTranscript, workerBee.cliName, apiKeys).then(async (summary) => {
            if (!summary) return;
            try {
              // Overwrite the session file with enriched content
              const enrichedContent = `# ${workerBee.cliName} Session Summary\n\nDate: ${dateStr}\nAgent: ${workerBee.cli}\nProject: ${saveDir}\n\n## Changes\n\n${summary.changes.map((c: string) => `- ${c}`).join('\n')}\n\n## Decisions\n\n${summary.decisions.map((d: any) => `- [${d.type}] ${d.description}`).join('\n')}\n\n## Raw Transcript\n\n\`\`\`\n${cleanTranscript}\n\`\`\`\n`;
              await nectarInstance.writeMemoryFile(
                `agents/sessions/${sessionId}.md`,
                enrichedContent,
                { agent: workerBee.cli, timestamp: Date.now() }
              );

              // Append decisions to appropriate memory files
              for (const decision of summary.decisions) {
                let targetFile = 'memory/knowledge.md';
                if (decision.type === 'architecture') targetFile = 'memory/decisions.md';
                else if (decision.type === 'convention') targetFile = 'memory/conventions.md';
                else if (decision.type === 'bug_fix') targetFile = 'memory/bugs.md';

                let existingContent = "";
                try {
                  const fileData = await nectarInstance.readMemoryFile(targetFile);
                  existingContent = fileData.content;
                } catch {}

                await nectarInstance.writeMemoryFile(
                  targetFile,
                  existingContent + `\n## [${dateStr.split('T')[0]}] ${workerBee.cliName} Session\n\n${decision.description}\n`
                );
                console.log(`[Nectar] ✓ Decision appended to ${targetFile}`);
              }
            } catch (e) {
              console.error("[Nectar] Failed to enrich session with AI summary:", e);
            }
          }).catch(e => console.error("[Nectar] AI summarization error:", e));
        }
      } catch (e) {
        console.error(`[Nectar] Failed to save session log for ${paneId}:`, e);
      }
    };


    setSpawnState("connecting");
    setStalled(false);

    let spawned = false;
    // Last measured grid — used to tell that layout has stopped moving.
    let lastCols = 0;
    let lastRows = 0;

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

        if (detectCommandNotFoundError(output, workerBee.cli)) {
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
      // but nothing stops a second WorkerBee being opened alongside a
      // still-running one, and it should see reasonably fresh context
      // without forcing the user to close the first one first.
      // One flush routine, shared by the 10s auto-sync and the manual button.
      // `force` (manual) bypasses the "enough new output" threshold so the
      // user always gets an immediate push. Targets the SHARED workhive mind
      // (sharedDirRef) so agents in different trees read each other's handoffs.
      const flushHandoff = async (force: boolean) => {
        const syncDir = sharedDirRef.current || spawnDir;
        if (disposed || !syncDir) return;
        const transcript = transcriptRef.current.trim();
        if (!force && transcript.length - lastFlushedLength < 200) return;
        if (!transcript) return;
        setSyncing(true);
        try {
          const nectarInstance = await Nectar.create(syncDir);
          await appendHandoffEntry(nectarInstance, syncDir, transcript, force ? "(manual sync)" : "(in progress)");
          lastFlushedLength = transcript.length;
          setLastSync(Date.now());
        } catch (e) {
          console.warn(`[Nectar] Handoff sync failed for ${paneId}:`, e);
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
            console.log(`[WorkerBeePane - ${paneId}] Process exited naturally. Saving session summary...`);
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
      // was hidden by a workhive switch or moved to the QueenBee dock). Replay
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
          `\r\n\x1b[38;5;108m[hiveory] reattached to the running ${workerBee.cliName}\x1b[0m`,
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
      // Nectar MCP server (with nectar_query tool) is registered at boot.
      // `nectarBridge` records which memory path actually engaged so we can
      // (a) show a visible marker in the pane and (b) skip the redundant stdin
      // push when a real MCP/plugin path is active.
      let nectarBridge: NectarBridge = "stdin-fallback";
      if (spawnDir) {
        try {
          nectarBridge = await ensureMCPConfigForCLI(workerBee.cli, spawnDir);
        } catch (e) {
          console.error(`[Nectar] MCP config FAILED for ${workerBee.cli} — nectar will not appear in MCP list:`, e);
          nectarBridge = "stdin-fallback";
          if (!disposed && terminal) {
            terminal.writeln(
              `\x1b[31m[nectar] MCP registration failed — ${String(e).slice(0, 200)}\x1b[0m`,
            );
          }
        }
        // Pre-accept Claude's "trust this folder" dialog (not covered by
        // --dangerously-skip-permissions). Safe no-op for other CLIs.
        await ensureCliWorkspaceTrust(workerBee.cli, spawnDir);
      }

      try {
        const command = workerBee.cli;
        // Always skip per-turn permission prompts for WorkerBees (Claude/Codex/etc.).
        const args = withPermissionBypass(command, workerBee.args || []);
        const env = envForCli(command, apiKeys);
        // The MCP server this CLI spawns inherits these: they tell it whether to
        // advertise QueenBee's orchestration tools, and which pane is asking.
        env.HIVEORY_PANE_ID = paneId;
        // So messages on the hive bus read "Builder said…", not a pane id.
        env.HIVEORY_BEE_NAME = displayName;
        if (queenRef.current.isQueen) env.HIVEORY_QUEEN = "1";
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

        setSpawnState("running");
        setStalled(false);

        stallTimer = setTimeout(() => {
          if (!disposed && spawnState === "connecting") setStalled(true);
        }, STALL_HINT_MS);

        startLoops();

        // Visible marker: show which Nectar memory bridge is live for this
        // pane, so testing doesn't require reading code or the devtools console.
        if (!disposed && terminal) {
          const bridgeLabel =
            nectarBridge === "mcp-plugin"
              ? "MCP PLUGIN (agy nectar_query, opt-in)"
              : nectarBridge === "mcp"
                ? "MCP (nectar_query tool)"
                : "stdin fallback (boot-time injection)";
          terminal.writeln(
            `\x1b[38;5;108m[nectar] memory bridge: ${bridgeLabel}\x1b[0m`,
          );
          console.log(`[Nectar] bridge for ${workerBee.cli} (${paneId}): ${nectarBridge}`);
        }

        // Memory tip: NEVER dump handoff transcripts into interactive TUI CLIs
        // (Claude Code / Codex / OpenCode / …). Those handoffs often contain
        // prior ConPTY/Ink chrome which shows up as "weird strings" in the
        // prompt. MCP-capable CLIs already have nectar_query — we only paint a
        // local xterm marker (not stdin). Stdin-fallback gets a short clean
        // pointer to `.nectar/` files, never raw transcript paste.
        if (spawnDir) {
          (async () => {
            try {
              await new Promise((resolve) => setTimeout(resolve, 2500));
              if (disposed || !terminal) return;

              // The crown carries a charter, but it is NEVER typed into the CLI:
              // a 1.5k-char blob pasted into an Ink prompt is unreadable noise
              // and burns a turn. It is published to .nectar/queen/ROLE.md and
              // the agent fetches it with the queen_role MCP tool.
              if (queenRef.current.isQueen) {
                workerBeesHost().publishQueenRole(
                  sharedDirRef.current || spawnDir,
                  queenRef.current.mode,
                );
                terminal.writeln(
                  `\x1b[38;5;178m[queenbee] crowned as ${queenRef.current.mode} — call queen_role for your charter\x1b[0m`,
                );
              }

              const openFiles = workerBeesHost().openFilesFor(sharedDirRef.current || spawnDir);
              const openFilesHint =
                openFiles.length > 0
                  ? ` Open files: ${openFiles.slice(0, 12).join(", ")}.`
                  : "";

              if (nectarBridge === "mcp" || nectarBridge === "mcp-plugin") {
                if (!disposed && terminal) {
                  terminal.writeln(
                    `\x1b[38;5;178m[nectar] ready — use nectar_query for project memory` +
                      `${openFiles.length ? ` (${openFiles.length} open files tracked)` : ""}\x1b[0m`,
                  );
                }
                // Do not writeToProcess — submitting a tip as a fake user turn
                // pollutes Claude/Codex/OpenCode chat and can land mid-wizard.
                console.log(`[Nectar] MCP bridge live for ${paneId}; skipped stdin injection`);
                return;
              }

              // MCP-capable CLIs (Claude Code, Kilo, Codex, OpenCode, …) NEVER get
              // stdin text — not even when their MCP config failed to write. A
              // blob pasted into an Ink prompt is noise the user has to clear by
              // hand; they have nectar_query instead.
              if (MCP_CAPABLE_CLIS.includes(workerBee.cli)) {
                if (!disposed && terminal) {
                  terminal.writeln(
                    `[38;5;178m[nectar] memory available via nectar_query (no prompt injection)[0m`,
                  );
                }
                return;
              }

              // Stdin-fallback only: short, sanitized pointer. Never paste handoffs.md.
              let ctxLine =
                "[Hiveory Nectar] Read .nectar/agents/handoffs.md and .nectar/memory/ for shared project context.";
              if (openFilesHint) ctxLine += openFilesHint;

              // If a clean handoff excerpt exists, append a tiny summary — skip garbage.
              try {
                const nectar = await Nectar.create(sharedDirRef.current || spawnDir!);
                const hf = await nectar.readMemoryFile("agents/handoffs.md");
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
                  `\x1b[38;5;178m[nectar] injecting memory pointer for ${workerBee.cliName}\x1b[0m`,
                );
              }
              writeToProcess(flattenForStdin(ctxLine) + "\n");
              console.log(`[Nectar] Injected stdin pointer (${ctxLine.length} chars) into ${paneId}`);
            } catch (e) {
              console.error("Nectar injection failed:", e);
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
          theme: buildXtermThemeFromDom(),
          // Required for the transparent background above to reach the glass.
          allowTransparency: true,
          rightClickSelectsWord: true,
          scrollback: 2000,
        };

        terminal = new XTerm(options);
        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(searchAddon);
        fitAddonRef.current = fitAddon;

        // Ctrl+C handling for WorkerBees. This must NEVER close the pane —
        // only the header close button removes a WorkerBee. So we fully own the
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

        // No WebGL renderer here on purpose. xterm's WebGL addon does not
        // honour allowTransparency: it paints an opaque backdrop, which would
        // put a solid rectangle over the pane's glass. The canvas renderer is
        // marginally slower and is what makes a transparent terminal possible.

        const fit = () => {
          if (disposed || !terminal) return false;
          try {
            fitAddon.fit();
            return true;
          } catch (e) {
            console.warn("[WorkerBeePane] fit() failed:", e);
            return false;
          }
        };
        const syncSize = () => {
          if (disposed || !terminal) return;
          const { rows, cols } = terminal;
          invoke("resize_terminal", { paneId, rows, cols }).catch(console.error);
        };

        const fitAndSync = () => {
          if (resizeDebounce) clearTimeout(resizeDebounce);
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
          }, 150);
        };

        onDataDisposable = terminal.onData((data) => {
          writeToProcess(data);
        });

        handleResize = fitAndSync;
        window.addEventListener("resize", handleResize);

        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width, height } = entry.contentRect;
            setPaneWidth(width);
            setPaneHeight(height);
          }
          fitAndSync();
        });
        resizeObserver.observe(terminalRef.current!);
        observerRef = resizeObserver;

        fitAndSync();
      } catch (e) {
        console.error("Failed to initialize WorkerBee pane:", e);
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
      if (handleResize) window.removeEventListener("resize", handleResize);
      observerRef?.disconnect();
      onDataDisposable?.dispose();

      // Keep the scrollback so a remount (workhive switch, crowning) can put
      // the user back where they were instead of facing a blank pane.
      saveTranscript(paneId, transcriptRef.current);

      // Only summarize on a REAL close. This unmount also fires on a plain
      // remount (workhive switch, crowning) where the pty lives on and gets
      // reattached — forgetSpawn() only runs on an actual close (PlaneHost's
      // handleRemove), so if the pane is still tracked here the agent is
      // still running and this isn't the end of its session.
      if (!isTrackedAsSpawned(paneId)) {
        saveSessionSummary(transcriptRef.current);
      }

      try {
      } catch (e) {
        console.warn("[WorkerBeePane] Failed to dispose WebGL addon:", e);
      }

      try {
        terminal?.dispose();
      } catch (e) {
        console.warn("[WorkerBeePane] Failed to dispose terminal:", e);
      } finally {
        terminalInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId, workerBee.cli, workingDir]);

  useEffect(() => {
    const onTheme = () => {
      const t = terminalInstance.current;
      if (!t) return;
      t.options.theme = buildXtermThemeFromDom();
      try {
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
              className="glass-inset text-bee-text px-2 py-0.5 rounded-md text-xs w-32 focus:outline-none focus:ring-1 focus:ring-bee-gold"
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={onRename}
              className="flex items-center gap-1.5 text-xs text-bee-text font-medium cursor-pointer hover:text-bee-goldHi transition-colors truncate"
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
              {workerBee.role && (
                <RoleBadge role={workerBee.role} branchName={workerBee.branchName} />
              )}
              <span className="truncate">{displayName}</span>
              {/* What this bee was summoned on, when the caller pinned it. */}
              {(workerBee.model || workerBee.effort) && paneWidth >= 300 && (
                <span
                  className="shrink-0 rounded border border-bee-border/60 px-1 py-px text-micro font-medium text-bee-textMuted"
                  title={`Running ${workerBee.model ?? "the CLI default"}${workerBee.effort ? ` at ${workerBee.effort} effort` : ""}`}
                >
                  {[workerBee.model, workerBee.effort].filter(Boolean).join(" · ")}
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
              if (isQueen) demoteQueen(workerBee.workHiveId ?? "");
              else promoteToQueen(workerBee.id);
            }}
            disabled={queenTaken}
            className={`p-1.5 rounded-md transition-colors ${
              isQueen
                ? "text-bee-goldHi bg-bee-gold/20"
                : queenTaken
                  ? "text-bee-textMuted/40 cursor-not-allowed"
                  : "text-bee-textDim hover:bg-bee-border/60 hover:text-bee-gold"
            }`}
            title={
              isQueen
                ? "Demote from QueenBee — returns this agent to the grid"
                : queenTaken
                  ? "This folder already has a QueenBee — demote it first"
                  : "Make QueenBee — moves this agent to the QueenBee tab"
            }
          >
            <QueenCrown size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); syncNowRef.current?.(); }}
            disabled={syncing}
            className={`p-1.5 rounded-md transition-colors disabled:cursor-default ${
              syncing ? "text-bee-gold" : "text-bee-textDim hover:bg-bee-border/60 hover:text-bee-text"
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
          {onToggleMaximize && paneWidth >= 240 && (
            <button
              onClick={onToggleMaximize}
              className="p-1.5 rounded-md hover:bg-bee-border/60 text-bee-textDim hover:text-bee-text transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
          {paneWidth >= 240 && (
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md hover:bg-bee-border/60 text-bee-textDim hover:text-bee-text transition-colors"
              title="Copy selection"
            >
              <Copy size={12} />
            </button>
          )}
          {paneWidth >= 240 && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-md hover:bg-bee-border/60 text-bee-textDim hover:text-bee-text transition-colors"
              title="Clear terminal"
            >
              <Eraser size={12} />
            </button>
          )}
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1.5 rounded-md text-bee-textDim hover:bg-bee-err/25 hover:text-bee-err transition-colors"
              title="Delete WorkerBee"
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
        style={{ contain: "layout paint", background: "rgb(var(--bee-canvas-hi))" }}
      >
        {/* xterm canvas — hidden (not unmounted) when CLI isn't installed */}
        <div
          ref={terminalRef}
          className={`absolute inset-2 overflow-hidden ${spawnState === "notFound" ? "invisible" : ""}`}
        />

        {/* CLI not found — rich install card, replaces xterm entirely */}
        {spawnState === "notFound" && (
          <CLINotFoundCard
            cli={workerBee.cli}
            cliName={workerBee.cliName}
            onClose={onClose}
          />
        )}

        {/* Loading / generic error overlay */}
        {spawnState !== "running" && spawnState !== "notFound" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none glass-inset backdrop-blur-[2px] animate-fade-in px-4 text-center">
            {spawnState === "error" ? (
              <>
                <AlertTriangle size={18} className="text-bee-err" />
                <span className="text-xs text-bee-textDim">
                  {displayName} failed to start
                </span>
              </>
            ) : (
              <>
                <Loader2 size={18} className="text-bee-gold animate-spin" />
                <span className="text-xs text-bee-textMuted">
                  Starting {displayName}…
                </span>
                {stalled && (
                  <span className="text-mini text-bee-warn max-w-[220px]">
                    Still nothing after {STALL_HINT_MS / 1000}s — is{" "}
                    <code className="font-mono">{workerBee.cli}</code> installed
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
