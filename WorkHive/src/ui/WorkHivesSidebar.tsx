"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { activatable, WorkerBeeMark, WorkHiveMark } from "@hiveory/honeyboard";
import {
  Search,
  X,
  GitBranch,
  Plus,
  Trash2,
  LoaderCircle,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pin,
  PinOff,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileCog,
  Braces,
  Hash,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Check,
  FolderPlus,
  GitMerge,
  type LucideIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkHiveStore, getActiveProjectPath, type WorkHive } from "../store.js";
import { useWorkerBeesStore, type AgentStatus } from "@hiveory/worker-bees/ui";
import { useProjectStore } from "../openFiles.js";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import WorkHiveCreateDialog from "./WorkHiveCreateDialog.js";

const MIN_WIDTH = 220;
const MAX_WIDTH = 500;

type LeftTab = "workHives" | "explorer" | "search";

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  launching: "bg-yellow-400",
  running: "bg-green-400",
  idle: "bg-bee-textMuted",
  error: "bg-red-400",
  done: "bg-bee-gold",
};

function beesOfWs(wsId: string) {
  return useWorkerBeesStore.getState().workerBees.filter((b) => b.workHiveId === wsId);
}

function hasActiveAgent(ws: WorkHive, statuses: Record<string, AgentStatus>): boolean {
  return beesOfWs(ws.id).some((b) => statuses[b.id] === "running" || statuses[b.id] === "launching");
}

function activeAgentCount(ws: WorkHive, statuses: Record<string, AgentStatus>): number {
  return beesOfWs(ws.id).filter((b) => statuses[b.id] === "running" || statuses[b.id] === "launching").length;
}

const WORKHIVE_COLORS = ["#c9a227", "#8fae7a", "#7f9db8", "#b79ae0", "#c66b5a", "#7fb3ab"];

interface Props {
  projectPath?: string | null;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClose?: () => void;
  /** App-level row rendered at the very top of the sidebar (mark, overflow
   *  menu, panel toggles). A node, not a set of callbacks: the host owns what
   *  those actions are. */
  topBar?: React.ReactNode;
}

interface ViewerTarget {
  path: string;
  line?: number;
  diff?: boolean;
  projectPath?: string | null;
}

interface FileNode {
  name: string;
  path: string;
  is_file: boolean;
  is_dir: boolean;
  children?: FileNode[];
  expanded?: boolean;
}

function getFileIcon(filename: string): { Icon: LucideIcon; className: string } {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, { Icon: LucideIcon; className: string }> = {
    ts: { Icon: FileCode, className: "text-bee-gold" },
    tsx: { Icon: FileCode, className: "text-bee-goldHi" },
    js: { Icon: FileCode, className: "text-bee-honey" },
    jsx: { Icon: FileCode, className: "text-bee-goldHi" },
    rs: { Icon: FileCode, className: "text-bee-err" },
    json: { Icon: Braces, className: "text-bee-amber" },
    md: { Icon: FileText, className: "text-bee-textDim" },
    css: { Icon: Hash, className: "text-bee-gold" },
    scss: { Icon: Hash, className: "text-bee-gold" },
    html: { Icon: FileCode, className: "text-bee-warn" },
    toml: { Icon: FileCog, className: "text-bee-textMuted" },
    yaml: { Icon: FileCog, className: "text-bee-textMuted" },
    yml: { Icon: FileCog, className: "text-bee-textMuted" },
  };
  return map[ext || ""] || { Icon: File, className: "text-bee-textMuted" };
}

function FileViewer({ target, onBack }: { target: ViewerTarget; onBack: () => void }) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const addOpenFile = useProjectStore((s) => s.addOpenFile);

  // Feed opened project files into Nectar MCP context for WorkerBees.
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
      <div className="flex items-center gap-1.5 border-b border-bee-border/30 px-2 py-1.5">
        <button
          onClick={onBack}
          className="flex size-5 shrink-0 items-center justify-center rounded text-bee-textMuted transition-colors hover:bg-bee-border/40 hover:text-bee-text"
          title="Back"
        >
          <ArrowLeft className="size-3" />
        </button>
        <span className="truncate text-mini font-medium text-bee-text" title={target.path}>
          {name}
        </span>
      </div>

      <div className="flex-1 overflow-auto scrollbar-sleek">
        {loading ? (
          <div className="px-3 py-2 text-mini text-bee-textMuted">Loading…</div>
        ) : error ? (
          <div className="px-3 py-2 text-mini text-bee-err">{error}</div>
        ) : content.trim() === "" ? (
          <div className="px-3 py-2 text-mini text-bee-textMuted">Empty file</div>
        ) : (
          <pre className="py-1 font-mono text-micro leading-[1.5]">
            {lines.map((l, i) => {
              const n = i + 1;
              const hit = target.line === n;
              return (
                <div
                  key={i}
                  ref={hit ? lineRef : undefined}
                  className={`flex gap-2 px-2 ${hit ? "bg-bee-gold/10" : ""}`}
                >
                  <span className="w-7 shrink-0 select-none text-right text-bee-textMuted/50">
                    {n}
                  </span>
                  <span className="whitespace-pre-wrap break-all text-bee-textDim">{l || " "}</span>
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}

function ExplorerPanel({
  projectPath,
  onOpen,
}: {
  projectPath: string | null;
  onOpen: (t: ViewerTarget) => void;
}) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectPath) return;
    loadDir(projectPath).then(setTree).finally(() => setLoading(false));
  }, [projectPath]);

  async function loadDir(path: string): Promise<FileNode[]> {
    try {
      const files = await invoke<any[]>("list_directory", { path });
      return files.map((f: any) => ({
        name: f.name,
        path: f.path,
        is_file: f.is_file,
        is_dir: f.is_dir,
        children: f.is_dir ? [] : undefined,
        expanded: false,
      }));
    } catch {
      return [];
    }
  }

  async function toggleExpand(node: FileNode) {
    if (!node.is_dir) return;
    if (!node.expanded && (!node.children || node.children.length === 0)) {
      const children = await loadDir(node.path);
      node.children = children;
    }
    node.expanded = !node.expanded;
    setTree([...tree]);
  }

  function renderNodes(nodes: FileNode[], level = 0) {
    return nodes.map((node) => {
      const { Icon, className } = getFileIcon(node.name);
      const activate = () => {
        if (node.is_dir) toggleExpand(node);
        else onOpen({ path: node.path });
      };
      return (
        <div key={node.path}>
          <div
            className="group flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer rounded-md text-bee-textDim hover:bg-bee-gold/10 hover:text-bee-text transition-colors"
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={activate}
            {...activatable(activate, node.name)}
            aria-expanded={node.is_dir ? node.expanded : undefined}
          >
            {node.is_dir ? (
              <>
                {node.expanded ? (
                  <ChevronDown size={13} className="text-bee-textMuted flex-shrink-0" />
                ) : (
                  <ChevronRight size={13} className="text-bee-textMuted flex-shrink-0" />
                )}
                {node.expanded ? (
                  <FolderOpen size={14} className="text-bee-gold flex-shrink-0" />
                ) : (
                  <Folder size={14} className="text-bee-gold flex-shrink-0" />
                )}
              </>
            ) : (
              <>
                <span className="w-[13px] flex-shrink-0" />
                <Icon size={14} className={`${className} flex-shrink-0`} />
              </>
            )}
            <span className="ml-0.5 truncate">{node.name}</span>
          </div>
          {node.expanded && node.children && renderNodes(node.children, level + 1)}
        </div>
      );
    });
  }

  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center text-bee-textMuted">
        <FolderOpen className="size-6 mb-2 opacity-50 text-bee-gold" />
        <p className="text-xs font-medium">No project open</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-sleek">
      {loading ? (
        <div className="px-3 py-2 text-xs text-bee-textMuted">Loading…</div>
      ) : tree.length === 0 ? (
        <div className="px-3 py-2 text-xs text-bee-textMuted">No files</div>
      ) : (
        <div className="py-1.5">{renderNodes(tree)}</div>
      )}
    </div>
  );
}

function SearchPanel({
  projectPath,
  onOpen,
}: {
  projectPath: string | null;
  onOpen: (t: ViewerTarget) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ path: string; line: number; text: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || !projectPath) return;
    setSearching(true);
    try {
      const apis = { invoke, open: openDialog };
      if (!apis.invoke) return;
      const grep = await apis.invoke<string>("run_command", {
        command: "rg",
        args: ["--no-heading", "--line-number", query, projectPath],
      });
      const lines = grep.split("\n").filter(Boolean).slice(0, 100);
      setResults(
        lines.flatMap((l) => {
          const m = l.match(/^(.*?):(\d+):([\s\S]*)$/);
          return m ? [{ path: m[1], line: parseInt(m[2], 10), text: m[3] }] : [];
        })
      );
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-bee-border/30">
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-bee-border/50 glass-inset px-2 focus-within:border-bee-gold/40">
          <Search className="size-3 shrink-0 text-bee-textMuted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Search code..."
            className="min-w-0 flex-1 bg-transparent py-1 text-mini text-bee-text outline-none placeholder:text-bee-textMuted/50"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-sleek">
        {searching ? (
          <div className="px-3 py-2 text-mini text-bee-textMuted">Searching…</div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center text-bee-textMuted">
            <Search className="size-6 mb-2 opacity-50 text-bee-gold" />
            <p className="text-xs font-medium">{query ? "No results" : "Search project code"}</p>
          </div>
        ) : (
          <div className="py-1">
            {results.map((r, i) => (
              <div
                key={i}
                onClick={() => onOpen({ path: r.path, line: r.line })}
                {...activatable(() => onOpen({ path: r.path, line: r.line }), `${r.path} line ${r.line}`)}
                className="px-3 py-1.5 text-mini hover:bg-bee-border/20 cursor-pointer transition-colors"
              >
                <span className="text-bee-gold truncate block">{r.path}</span>
                <span className="text-bee-textMuted/70">Line {r.line}: {r.text.slice(0, 80)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ADEWorktreeSidebar({ projectPath, pinned = true, onTogglePin, onClose, topBar }: Props) {
  const [activeTab, setActiveTab] = useState<LeftTab>("workHives");
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);

  const workHives = useWorkHiveStore((s) => s.workHives);
  const activeWorkHiveId = useWorkHiveStore((s) => s.activeWorkHiveId);
  const activateAndSync = useWorkHiveStore((s) => s.activateWorkHiveAndSync);
  const updateWorkHive = useWorkHiveStore((s) => s.updateWorkHive);
  const renameWorkHive = useWorkHiveStore((s) => s.renameWorkHive);
  const deleteWorkHive = useWorkHiveStore((s) => s.deleteWorkHive);
  const commitDeleteWorkHive = useWorkHiveStore((s) => s.commitDeleteWorkHive);
  const cancelDeleteWorkHive = useWorkHiveStore((s) => s.cancelDeleteWorkHive);
  const renamingWorkHiveId = useWorkHiveStore((s) => s.renamingWorkHiveId);
  const setRenamingWorkHiveId = useWorkHiveStore((s) => s.setRenamingWorkHiveId);
  const agentStatuses = useWorkerBeesStore((s) => s.agentStatuses);

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hideSleeping, setHideSleeping] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ ws: WorkHive; x: number; y: number } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      let newWidth = e.clientX - rect.left;
      newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  const visibleWorkHives = workHives.filter((ws) => {
    if (hideSleeping && !hasActiveAgent(ws, agentStatuses) && beesOfWs(ws.id).length === 0) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return ws.name.toLowerCase().includes(q);
  });

  const handleAdd = () => {
    setCreateDialogOpen(true);
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingWorkHiveId(id);
    setEditValue(currentName);
  };

  const commitRename = () => {
    if (renamingWorkHiveId && editValue.trim()) {
      renameWorkHive(renamingWorkHiveId, editValue.trim());
    }
    setRenamingWorkHiveId(null);
    setEditValue("");
  };

  const handleContextMenu = (e: React.MouseEvent, ws: WorkHive) => {
    e.preventDefault();
    setContextMenu({ ws, x: e.clientX, y: e.clientY });
  };

  // Not LucideIcon: the Projects tab carries Hiveory's own workhive mark, which
  // is a plain function component, not a lucide forwardRef.
  const TABS: { id: LeftTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "workHives", label: "Projects", icon: WorkHiveMark },
    { id: "explorer", label: "Explorer", icon: Folder },
    { id: "search", label: "Search", icon: Search },
  ];

  // Narrow sidebar → icon-only tabs (matches the right dock's behavior).
  const compact = sidebarWidth < 300;

  return (
    <div
      ref={sidebarRef}
      className="relative h-full flex flex-col glass-rail border-r border-bee-border/50 shrink-0"
      style={{ width: sidebarWidth }}
    >
      {/* App row — the window's top-left corner. The mark, the overflow menu
          and the panel toggles live here rather than over the pane strip,
          because they act on the app, not on the panes. Supplied by the host:
          this package must not know what "settings" or "extensions" are. */}
      {topBar && (
        <div
          className="flex h-11 shrink-0 items-center gap-0.5 border-b border-bee-border/40 px-2"
          data-tauri-drag-region
        >
          {topBar}
        </div>
      )}

      {/* Sidebar Sub-Tabs Header (WorkHives, Explorer, Search) */}
      <div className="flex items-center border-b border-bee-border/40 shrink-0">
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
                  ? "text-bee-goldHi bg-bee-gold/[0.06] border-b-2 border-bee-gold"
                  : "text-bee-textMuted hover:text-bee-textDim hover:bg-bee-border/20"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              {!compact && <span className="truncate">{tab.label}</span>}
            </button>
          );
        })}

        <div className="flex items-center pr-1 shrink-0">
          <button
            onClick={onTogglePin}
            className={`size-7 flex items-center justify-center transition-colors ${
              pinned ? "text-bee-goldHi/70" : "text-bee-textMuted hover:text-bee-textDim"
            }`}
            title={pinned ? "Unpin sidebar" : "Pin sidebar"}
          >
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="size-7 flex items-center justify-center text-bee-textMuted hover:text-bee-text hover:bg-bee-border/30 transition-colors"
              title="Close sidebar"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {viewer ? (
          <FileViewer target={viewer} onBack={() => setViewer(null)} />
        ) : activeTab === "explorer" ? (
          <ExplorerPanel projectPath={projectPath || null} onOpen={setViewer} />
        ) : activeTab === "search" ? (
          <SearchPanel projectPath={projectPath || null} onOpen={setViewer} />
        ) : (
          /* WorkHives Tab Content */
          <>
            {/* Filter + Add Toolbar */}
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-bee-border/30">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHideSleeping(!hideSleeping)}
                  className={`size-6 rounded flex items-center justify-center transition-colors ${
                    hideSleeping ? "text-bee-goldHi bg-bee-gold/10" : "text-bee-textMuted hover:text-bee-text hover:bg-bee-border/40"
                  }`}
                  title={hideSleeping ? "Show sleeping" : "Hide sleeping"}
                >
                  {hideSleeping ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
                <span className="text-micro font-medium text-bee-textMuted bg-bee-border/20 px-1.5 py-0.5 rounded-full">
                  {visibleWorkHives.length}
                </span>
              </div>

              <button
                onClick={handleAdd}
                className="flex items-center gap-1 rounded bg-bee-gold/10 px-2 py-0.5 text-micro font-medium text-bee-goldHi hover:bg-bee-gold/20 transition-colors"
              >
                <Plus className="size-3" /> New Workspace
              </button>
            </div>

            {/* WorkHives Search */}
            <div className="px-2 py-1.5">
              <div className="flex h-7 items-center gap-1.5 rounded-md border border-bee-border/50 glass-inset px-2 focus-within:border-bee-gold/40 focus-within:ring-[1px] focus-within:ring-bee-gold/20">
                <Search className="size-3 shrink-0 text-bee-textMuted" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter workHives..."
                  className="min-w-0 flex-1 bg-transparent py-1 text-mini text-bee-text outline-none placeholder:text-bee-textMuted/50"
                  spellCheck={false}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="size-4 rounded flex items-center justify-center text-bee-textMuted hover:text-bee-text"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Flat workhive list */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-sleek">
              {visibleWorkHives.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                  <WorkHiveMark size={26} className="mb-2 text-bee-textMuted/50" />
                  <p className="text-mini text-bee-textMuted">
                    {searchQuery ? "No matching workHives" : hideSleeping ? "All workHives sleeping" : "No workHives yet"}
                  </p>
                </div>
              ) : (
                visibleWorkHives.map((ws) => (
                  <div key={ws.id} className="relative" onContextMenu={(e) => handleContextMenu(e, ws)}>
                    <ProjectGroup
                      ws={ws}
                      isActive={ws.id === activeWorkHiveId}
                      hasActive={hasActiveAgent(ws, agentStatuses)}
                      onActivate={() => { if (!ws.isDeleting) activateAndSync(ws.id); }}
                      onMenu={(e) => setContextMenu({ ws, x: e.clientX, y: e.clientY })}
                      onDelete={() => deleteWorkHive(ws.id)}
                      isRenaming={renamingWorkHiveId === ws.id}
                      editValue={editValue}
                      onEditChange={setEditValue}
                      onCommitRename={commitRename}
                      onCancelRename={() => { setRenamingWorkHiveId(null); setEditValue(""); }}
                      onStartRename={() => startRename(ws.id, ws.name)}
                    />

                    {ws.isDeleting && (
                      <div className="absolute inset-x-1 inset-y-0 z-10 flex items-center justify-center rounded-md glass backdrop-blur-[1px]">
                        <div className="inline-flex items-center gap-2 rounded-full glass-hi border border-bee-border/60 px-3 py-1 text-mini font-medium text-bee-text shadow-sm">
                          <LoaderCircle className="size-3 animate-spin text-bee-textMuted" />
                          <span>Queued for deletion</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelDeleteWorkHive(ws.id); }}
                            className="ml-1 text-bee-textMuted hover:text-bee-text transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); commitDeleteWorkHive(ws.id); }}
                            className="text-bee-err hover:text-red-300 transition-colors font-semibold"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Context menu — portaled above the plane (backdrop-blur traps in-tree fixed). */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-[201] min-w-40 py-1 rounded-lg glass-hi animate-fade-in shadow-glassHi"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={() => setContextMenu(null)}
          >
            <button
              onClick={() => { startRename(contextMenu.ws.id, contextMenu.ws.name); setContextMenu(null); }}
              className="w-full px-3 py-1.5 text-left text-xs text-bee-textDim hover:text-bee-text hover:bg-bee-gold/10 transition-colors"
            >
              Rename
            </button>
            <button
              onClick={() => {
                const colors = WORKHIVE_COLORS;
                const nextColor = colors[(colors.indexOf(contextMenu.ws.color) + 1) % colors.length];
                updateWorkHive(contextMenu.ws.id, { color: nextColor });
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-bee-textDim hover:text-bee-text hover:bg-bee-gold/10 transition-colors"
            >
              Cycle color
            </button>
            <div className="h-px bg-bee-border/40 my-1 mx-2" />
            <button
              onClick={() => { deleteWorkHive(contextMenu.ws.id); setContextMenu(null); }}
              className="w-full px-3 py-1.5 text-left text-xs text-bee-err hover:bg-bee-err/15 transition-colors"
            >
              Delete
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* Resize handle */}
      <div
        className="absolute -right-2 top-0 z-40 flex h-full w-4 cursor-col-resize items-stretch justify-center group select-none"
        onMouseDown={handleResizeStart}
      >
        <div className="h-full w-px bg-bee-border/40 transition-colors group-hover:bg-bee-gold/60 group-active:bg-bee-gold" />
      </div>

      <WorkHiveCreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </div>
  );
}

/* ── hiveory project group: collapsible header + tree rows ───── */
function ProjectGroup({
  ws, isActive, hasActive, onActivate, onMenu, onDelete,
  isRenaming, editValue, onEditChange, onCommitRename, onCancelRename, onStartRename,
}: {
  ws: WorkHive;
  isActive: boolean;
  hasActive: boolean;
  onActivate: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onDelete: () => void;
  isRenaming: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
}) {
  const createWorktree = useWorkHiveStore((s) => s.createWorktree);
  const removeWorktree = useWorkHiveStore((s) => s.removeWorktree);
  const mergeWorktree = useWorkHiveStore((s) => s.mergeWorktree);
  const updateWorkHive = useWorkHiveStore((s) => s.updateWorkHive);
  const activateAndSync = useWorkHiveStore((s) => s.activateWorkHiveAndSync);

  const [collapsed, setCollapsed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const trees = ws.worktrees ?? [];
  const noRepo = !ws.boundProjectPath;
  const repoName = ws.boundProjectPath ? ws.boundProjectPath.split(/[\\/]/).filter(Boolean).pop() : null;

  // Bind a git repo folder to this project so trees can be created against it.
  const bindRepo = async () => {
    setError(null);
    try {
      const apis = { invoke, open: openDialog };
      const folder = await apis.open?.({ directory: true, multiple: false, title: "Select a git repository" });
      if (typeof folder === "string") {
        // bindFolder keeps one folder to one workhive — if another already
        // owns it, we switch there instead of splitting its Nectar brain.
        const boundTo = useWorkHiveStore.getState().bindFolder(ws.id, folder);
        activateAndSync(boundTo);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try { await createWorktree(ws.id, name); setName(""); setAdding(false); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setPendingId(id); setError(null);
    try { await removeWorktree(ws.id, id); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setPendingId(null); }
  };
  const merge = async (id: string) => {
    setPendingId(id); setError(null);
    try { await mergeWorktree(ws.id, id); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setPendingId(null); }
  };

  return (
    // Selection belongs to the WORKSPACE, so ONE box wraps the whole group —
    // the same card treatment a tree row gets, one level up. The rows inside
    // stay unhighlighted: lighting them all up made every branch look picked.
    <div
      className={`mx-1.5 my-1 rounded-xl border pb-1 transition-colors ${
        isActive
          ? "border-bee-gold/40 bg-bee-gold/[0.06]"
          : "border-bee-border/30 hover:border-bee-border/60"
      }`}
    >
      {/* Project header — clicking anywhere on it selects the workhive. */}
      <div
        className="group flex cursor-pointer items-center gap-1 px-2 py-1.5"
        onClick={() => { if (!isRenaming) onActivate(); }}
        {...activatable(() => { if (!isRenaming) onActivate(); }, `Workhive ${ws.name}`)}
        aria-current={isActive ? "true" : undefined}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }}
          className="flex size-4 shrink-0 items-center justify-center text-bee-textMuted hover:text-bee-text"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>

        {isRenaming ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => { if (e.key === "Enter") onCommitRename(); if (e.key === "Escape") onCancelRename(); }}
            className="min-w-0 flex-1 bg-transparent border-b border-bee-gold/40 text-sm font-semibold text-bee-text outline-none"
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-sm font-semibold text-bee-text"
            onDoubleClick={onStartRename}
            title={ws.boundProjectPath || ws.name}
          >
            {ws.name}
          </span>
        )}

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onMenu(e); }} className="flex size-6 items-center justify-center rounded text-bee-textMuted hover:bg-bee-border/40 hover:text-bee-text" title="Project menu">
            <MoreHorizontal className="size-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (noRepo) { bindRepo(); return; } setAdding((v) => !v); setError(null); }}
            title={noRepo ? "Bind a git repo to this project" : "New tree (git worktree)"}
            className="flex size-6 items-center justify-center rounded text-bee-textMuted hover:bg-bee-gold/15 hover:text-bee-goldHi"
          >
            {noRepo ? <FolderPlus className="size-3.5" /> : <Plus className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* New-tree inline input */}
      {adding && (
        <div className="mx-2 mb-1 flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setAdding(false); setName(""); } }}
            placeholder="tree name (e.g. feature-x)"
            className="min-w-0 flex-1 rounded border border-bee-border/60 glass-inset px-2 py-1 text-mini text-bee-text outline-none focus:border-bee-gold/50"
          />
          <button onClick={submit} disabled={busy || !name.trim()} className="flex size-6 items-center justify-center rounded text-bee-goldHi hover:bg-bee-gold/15 disabled:opacity-40" title="Create">
            {busy ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3" />}
          </button>
          <button onClick={() => { setAdding(false); setName(""); }} className="flex size-6 items-center justify-center rounded text-bee-textMuted hover:text-bee-text" title="Cancel">
            <X className="size-3" />
          </button>
        </div>
      )}

      {error && <div className="mx-2 mb-1 text-micro text-bee-err break-words">{error}</div>}

      {/* Rows: primary (main repo) + worktrees */}
      {!collapsed && (
        <div className="flex flex-col">
          <TreeRow
            dot={hasActive ? STATUS_DOT_CLASS.running : "bg-bee-textMuted/40"}
            name={repoName || "main"}
            badge="primary"
            branch={repoName ? "main branch" : "no repo"}
            onClick={noRepo ? bindRepo : onActivate}
          />
          {trees.map((t) => (
            <TreeRow
              key={t.id}
              dot="bg-bee-textMuted/40"
              name={t.name}
              branch={t.branch}
              onClick={onActivate}
              onMerge={() => merge(t.id)}
              onRemove={() => remove(t.id)}
              pending={pendingId === t.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── a single row: status dot + name + optional badge + branch ──── */
function TreeRow({
  dot, name, badge, branch, active, onClick, onMerge, onRemove, pending,
}: {
  dot: string;
  name: string;
  badge?: string;
  branch: string;
  active?: boolean;
  onClick?: () => void;
  onMerge?: () => void;
  onRemove?: () => void;
  pending?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      {...(onClick ? activatable(onClick, `${name} branch ${branch}`) : {})}
      aria-current={active ? "true" : undefined}
      className={`group/row mx-1.5 my-0.5 cursor-pointer rounded-lg border px-2.5 py-2 transition-colors ${
        active ? "border-bee-gold/40 bg-bee-gold/[0.06]" : "border-bee-border/40 hover:bg-bee-border/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className={`truncate text-sm font-medium ${active ? "text-bee-goldHi" : "text-bee-text"}`}>{name}</span>
        {badge && (
          <span className="shrink-0 rounded-sm border border-bee-border/60 bg-bee-border/20 px-1.5 py-0 text-micro font-medium text-bee-textDim">
            {badge}
          </span>
        )}
        {(onMerge || onRemove) && (
          <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
            {pending ? (
              <LoaderCircle className="size-3 animate-spin text-bee-textMuted" />
            ) : (
              <>
                {onMerge && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMerge(); }}
                    className="flex size-5 items-center justify-center rounded text-bee-textMuted hover:bg-bee-gold/15 hover:text-bee-goldHi"
                    title="Merge branch into main + remove tree"
                  >
                    <GitMerge className="size-3" />
                  </button>
                )}
                {onRemove && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="flex size-5 items-center justify-center rounded text-bee-textMuted hover:bg-bee-err/15 hover:text-bee-err"
                    title="Remove tree (discard)"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1 pl-4 text-mini text-bee-textMuted">
        <GitBranch className="size-2.5 shrink-0" />
        <span className="truncate">{branch}</span>
      </div>
    </div>
  );
}
