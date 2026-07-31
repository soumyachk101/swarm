"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  GitBranch,
  X,
  Pin,
  PinOff,
  Plus,
  Minus,
  Check,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { LeadPanel, LeadModeSelect } from "@swarm/lead/ui";
import { LeadCrown } from "@swarm/board";
import { GlassChatEmbed } from "@swarm/plugins";
import { useProjectStore } from "@swarm/workspace";
import { useAgentsStore } from "@swarm/agents/ui";
import { getActiveProjectPath } from "@swarm/workspace";

type DockTab = "chat" | "glasschat" | "git";

interface Props {
  projectPath: string | null;
  activeWorkspaceId?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenProject?: () => void;
}

interface ViewerTarget {
  path: string;
  line?: number;
  diff?: boolean;
  projectPath?: string | null;
}

// ── File / diff viewer for Git ──────────────────────────────────
function FileViewer({ target, onBack }: { target: ViewerTarget; onBack: () => void }) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const addOpenFile = useProjectStore((s) => s.addOpenFile);

  useEffect(() => {
    if (target.path && !target.diff) {
      addOpenFile(target.projectPath ?? getActiveProjectPath(), target.path);
    }
  }, [target.path, target.diff, target.projectPath, addOpenFile]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const text = target.diff && target.projectPath
          ? await invoke<string>("run_command", {
              command: "git",
              args: ["-C", target.projectPath, "diff", "--", target.path],
            })
          : await invoke<string>("read_file", { path: target.path });
        if (!cancelled) setContent(text);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [target.path, target.diff, target.projectPath]);

  useEffect(() => {
    if (!loading && target.line) {
      lineRef.current?.scrollIntoView({ block: "center" });
    }
  }, [loading, target.line]);

  const name = target.path.split(/[\\/]/).pop();
  const lines = content.split("\n");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-swarm-border/30 px-2 py-1.5">
        <button
          onClick={onBack}
          className="flex size-5 shrink-0 items-center justify-center rounded text-swarm-textMuted transition-colors hover:bg-swarm-border/40 hover:text-swarm-text"
          title="Back"
        >
          &larr;
        </button>
        <span className="truncate text-mini font-medium text-swarm-text" title={target.path}>
          {name}
        </span>
        {target.diff && (
          <span className="ml-auto shrink-0 rounded bg-swarm-gold/10 px-1 py-px text-micro font-bold uppercase text-swarm-gold">
            diff
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto scrollbar-sleek">
        {loading ? (
          <div className="px-3 py-2 text-mini text-swarm-textMuted">Loading…</div>
        ) : error ? (
          <div className="px-3 py-2 text-mini text-swarm-err">{error}</div>
        ) : content.trim() === "" ? (
          <div className="px-3 py-2 text-mini text-swarm-textMuted">
            {target.diff ? "No diff — file is unchanged or untracked." : "Empty file"}
          </div>
        ) : (
          <pre className="py-1 font-mono text-micro leading-[1.5]">
            {lines.map((l, i) => {
              const n = i + 1;
              const hit = target.line === n;
              const color = target.diff
                ? l.startsWith("+") && !l.startsWith("+++")
                  ? "text-swarm-ok"
                  : l.startsWith("-") && !l.startsWith("---")
                  ? "text-swarm-err"
                  : l.startsWith("@@")
                  ? "text-swarm-gold"
                  : "text-swarm-textDim"
                : "text-swarm-textDim";
              return (
                <div
                  key={i}
                  ref={hit ? lineRef : undefined}
                  className={`flex gap-2 px-2 ${hit ? "bg-swarm-gold/10" : ""}`}
                >
                  <span className="w-7 shrink-0 select-none text-right text-swarm-textMuted/50">
                    {n}
                  </span>
                  <span className={`whitespace-pre-wrap break-all ${color}`}>{l || " "}</span>
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Git Panel ──────────────────────────────────────────────────
interface GitEntry { index: string; work: string; file: string; staged: boolean }

function parsePorcelain(raw: string): GitEntry[] {
  return raw.split("\n").filter(Boolean).map((l) => {
    const index = l[0] ?? " ";
    const work = l[1] ?? " ";
    let file = l.slice(3);
    const arrow = file.indexOf(" -> ");
    if (arrow !== -1) file = file.slice(arrow + 4);
    file = file.replace(/^"|"$/g, "");
    return { index, work, file, staged: index !== " " && index !== "?" };
  });
}

function GitPanel({
  projectPath,
  onOpen,
}: {
  projectPath: string | null;
  onOpen: (t: ViewerTarget) => void;
}) {
  const [branch, setBranch] = useState("");
  const [entries, setEntries] = useState<GitEntry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    try {
      const status = await invoke<{ branch: string; changed: number }>("git_status", { projectPath });
      setBranch(status.branch);
      const raw = await invoke<string>("run_command", {
        command: "git",
        args: ["-C", projectPath, "status", "--porcelain"],
      });
      setEntries(parsePorcelain(raw));
    } catch {}
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath) return;
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [projectPath, refresh]);

  const git = async (args: string[], okNote?: string) => {
    if (!projectPath || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await invoke<string>("run_command", { command: "git", args: ["-C", projectPath, ...args] });
      if (okNote) setNote(okNote);
      await refresh();
    } catch (e: any) {
      setNote(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const staged = entries.filter((e) => e.staged);
  const unstaged = entries.filter((e) => !e.staged);

  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center text-swarm-textMuted">
        <GitBranch className="size-6 mb-2 opacity-50 text-swarm-gold" />
        <p className="text-xs font-medium">No project open</p>
      </div>
    );
  }

  const Row = ({ e }: { e: GitEntry }) => {
    const code = (e.staged ? e.index : e.work).trim() || "?";
    const color =
      code === "M" ? "text-swarm-gold" : code === "A" ? "text-swarm-ok"
      : code === "D" ? "text-swarm-err" : "text-swarm-textMuted";
    return (
      <div className="group flex items-center gap-1.5 px-2 py-1 text-mini transition-colors hover:bg-swarm-border/20">
        <span className={`w-3 shrink-0 font-mono text-micro ${color}`}>{code}</span>
        <span
          onClick={() => onOpen({ path: `${projectPath}/${e.file}`, diff: !e.file.startsWith("??"), projectPath })}
          className="flex-1 cursor-pointer truncate text-swarm-textDim hover:text-swarm-text"
          title={e.file}
        >
          {e.file}
        </span>
        <button
          disabled={busy}
          onClick={() => git(e.staged ? ["reset", "-q", "HEAD", "--", e.file] : ["add", "--", e.file])}
          className="shrink-0 rounded p-0.5 text-swarm-textMuted opacity-0 transition-all hover:bg-swarm-border/50 hover:text-swarm-gold group-hover:opacity-100 disabled:opacity-30"
          title={e.staged ? "Unstage" : "Stage"}
        >
          {e.staged ? <Minus className="size-3" /> : <Plus className="size-3" />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-swarm-border/30 px-2.5 py-2">
        <div className="flex items-center gap-2 text-xs">
          <GitBranch className="size-3.5 shrink-0 text-swarm-gold" />
          <span className="truncate font-medium text-swarm-text">{branch || "no repo"}</span>
          <span className="ml-auto shrink-0 text-micro text-swarm-textMuted">
            {entries.length} changed
          </span>
        </div>

        <div className="mt-2 flex items-center gap-1">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && message.trim() && staged.length > 0) {
                git(["commit", "-m", message.trim()], "Committed").then(() => setMessage(""));
              }
            }}
            placeholder={staged.length ? "Commit message…" : "Stage files to commit"}
            className="min-w-0 flex-1 rounded-md border border-swarm-border/50 glass-inset px-2 py-1 text-mini text-swarm-text outline-none transition-colors placeholder:text-swarm-textMuted/50 focus:border-swarm-gold/40"
          />
          <button
            disabled={busy || !message.trim() || staged.length === 0}
            onClick={() => git(["commit", "-m", message.trim()], "Committed").then(() => setMessage(""))}
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-swarm-gold/10 text-swarm-goldHi transition-colors hover:bg-swarm-gold/20 disabled:opacity-30"
            title={staged.length ? `Commit ${staged.length} file(s)` : "Nothing staged"}
          >
            <Check className="size-3" />
          </button>
        </div>
        {note && <div className="mt-1 truncate text-micro text-swarm-textMuted">{note}</div>}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-sleek py-1">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center text-swarm-textMuted">
            <GitBranch className="mb-2 size-6 opacity-50 text-swarm-gold" />
            <p className="text-xs font-medium">No changes</p>
          </div>
        ) : (
          <>
            {staged.length > 0 && (
              <>
                <div className="px-2 py-1 text-micro font-semibold uppercase tracking-wider text-swarm-gold">
                  Staged ({staged.length})
                </div>
                {staged.map((e) => <Row key={`s-${e.file}`} e={e} />)}
              </>
            )}
            {unstaged.length > 0 && (
              <>
                <div className="px-2 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider text-swarm-textDim">
                  Changes ({unstaged.length})
                </div>
                {unstaged.map((e) => <Row key={`u-${e.file}`} e={e} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Dock Tabs ─────────────────────────────────────────────────
const TABS: { id: DockTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "chat", label: "Lead", icon: LeadCrown },
  { id: "glasschat", label: "GlassChat", icon: MessageSquare },
  { id: "git", label: "Git", icon: GitBranch },
];

const RIGHT_DOCK_MIN = 260;
const RIGHT_DOCK_MAX = 520;

export default function ADERightDock({
  projectPath,
  activeWorkspaceId,
  pinned = true,
  onTogglePin,
  onClose,
  onOpenSettings,
  onOpenProject,
}: Props) {
  const [activeTab, setActiveTab] = useState<DockTab>("chat");
  // A fresh promotion should show the new Lead, not whatever tab was open.
  const leadId = useAgentsStore((s) => s.agents.find((b) => b.isLead)?.id ?? null);
  useEffect(() => {
    if (leadId) setActiveTab("chat");
  }, [leadId]);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [dockWidth, setDockWidth] = useState(340);
  const compact = dockWidth < 380;
  const [isResizing, setIsResizing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dockRef.current) return;
      const rect = dockRef.current.getBoundingClientRect();
      let newWidth = rect.right - e.clientX;
      newWidth = Math.max(RIGHT_DOCK_MIN, Math.min(RIGHT_DOCK_MAX, newWidth));
      setDockWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      ref={dockRef}
      className={
        isExpanded
          ? "fixed inset-0 z-[140] flex flex-col glass-hi shadow-2xl animate-fade-in p-2"
          : "relative h-full flex flex-col glass-rail border-l border-swarm-border/50"
      }
      style={isExpanded ? {} : { width: dockWidth, minWidth: RIGHT_DOCK_MIN, maxWidth: RIGHT_DOCK_MAX }}
    >
      {/* Dock header with sub-tabs */}
      <div className="flex items-center border-b border-swarm-border/40 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setViewer(null); }}
              title={tab.label}
              className={`flex items-center justify-center gap-1.5 flex-1 min-w-0 h-9 px-2 text-mini font-medium transition-colors whitespace-nowrap ${
                active
                  ? "text-swarm-goldHi bg-swarm-gold/[0.06] border-b-2 border-swarm-gold"
                  : "text-swarm-textMuted hover:text-swarm-textDim hover:bg-swarm-border/20"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              {!compact && <span className="truncate">{tab.label}</span>}
            </button>
          );
        })}

        {activeTab === "chat" && (
          <div className="mr-1 flex shrink-0 items-center">
            <LeadModeSelect />
          </div>
        )}
        <button
          onClick={onTogglePin}
          className={`size-8 flex items-center justify-center transition-colors shrink-0 ${
            pinned ? "text-swarm-goldHi/70" : "text-swarm-textMuted hover:text-swarm-textDim"
          }`}
          title={pinned ? "Unpin panel" : "Pin panel"}
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </button>
        <button
          onClick={onClose}
          className="size-8 flex items-center justify-center text-swarm-textMuted hover:text-swarm-text hover:bg-swarm-border/30 transition-colors shrink-0"
          title="Close panel"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Resize handle */}
      {!isExpanded && (
        <div
          className="absolute -left-2 top-0 z-40 flex h-full w-4 cursor-col-resize items-stretch justify-center group select-none"
          onMouseDown={handleResizeStart}
          title="Drag to resize panel"
        >
          <div className={`h-full w-0.5 transition-colors ${isResizing ? "bg-swarm-gold" : "bg-swarm-border/60 group-hover:bg-swarm-gold/80"}`} />
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Hidden rather than unmounted: the Lead tab hosts a live CLI, and
            unmounting it would kill and respawn that agent on every tab switch. */}
        <div className={`h-full ${activeTab === "chat" ? "" : "hidden"}`}>
          <LeadPanel />
        </div>
        {activeTab === "glasschat" && (
          <GlassChatEmbed
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded(!isExpanded)}
          />
        )}
        {activeTab === "git" && (
          viewer ? (
            <FileViewer target={viewer} onBack={() => setViewer(null)} />
          ) : (
            <GitPanel projectPath={projectPath} onOpen={setViewer} />
          )
        )}
      </div>
    </div>
  );
}
