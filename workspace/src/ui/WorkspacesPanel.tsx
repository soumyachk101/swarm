"use client";

import { useState } from "react";
import { X, Plus, Pin, PinOff } from "lucide-react";
import { activatable, AgentMark, WorkspaceMark } from "@swarm/board";
import { useWorkspaceStore } from "../store.js";
import { useAgentsStore, type AgentStatus } from "@swarm/agents/ui";

interface WorkspacesPanelProps {
  onClose: () => void;
  docked?: boolean;
  onToggleDock?: () => void;
}

// Tokens, not raw Tailwind palette entries: bg-green-400 stayed the same green
// in Rose, Forest and Dracula and clashed with every one of them.
const STATUS_DOT: Record<AgentStatus, string> = {
  launching: "bg-swarm-warn animate-pulse",
  running: "bg-swarm-ok",
  idle: "bg-swarm-textMuted",
  error: "bg-swarm-err",
  done: "bg-swarm-gold",
};

export default function WorkspacesPanel({ onClose, docked, onToggleDock }: WorkspacesPanelProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const activateAndSync = useWorkspaceStore((s) => s.activateWorkspaceAndSync);
  const agents = useAgentsStore((s) => s.agents);
  const agentStatuses = useAgentsStore((s) => s.agentStatuses);
  const boardOpen = useWorkspaceStore((s) => s.boardOpen);

  const [editingWs, setEditingWs] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Committing a blank rename leaves a nameless row that can't be told apart
  // from its neighbours, so an empty value just cancels the edit.
  const commitRename = (id: string) => {
    const next = editValue.trim();
    if (next) updateWorkspace(id, { name: next, autoNamed: false });
    setEditingWs(null);
  };

  const handleAdd = () => {
    const colors = ['#c9a227', '#8fae7a', '#7f9db8', '#b79ae0', '#c66b5a', '#7fb3ab'];
    const ws = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "Untitled",
      autoNamed: true,
      color: colors[Math.floor(Math.random() * colors.length)],
      boundProjectPath: "",
      taskCards: [],
    };
    addWorkspace(ws);
  };

  const handleActivate = (id: string) => {
    activateAndSync(id);
    if (!docked) onClose();
  };

  return (
    <div
      className="h-full glass-hi border-r border-swarm-border/60 flex flex-col overflow-hidden animate-fade-in"
      style={{ width: "280px", minWidth: "280px" }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-swarm-border/50">
        <span className="text-xs font-semibold text-swarm-gold uppercase tracking-wider">Workspaces</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleDock}
            className="p-1 rounded-md hover:bg-swarm-border/60 text-swarm-textMuted hover:text-swarm-text transition-colors"
            title={docked ? "Switch to floating overlay" : "Dock to side"}
          >
            {docked ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button
            onClick={onClose}
            title="Close workspaces"
            aria-label="Close workspaces"
            className="p-1 rounded-md hover:bg-swarm-border/60 text-swarm-textMuted hover:text-swarm-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-sleek p-2 space-y-1">
        {/* A blank panel reads as a broken render; say the list is empty on purpose. */}
        {workspaces.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <WorkspaceMark size={24} className="mb-2 text-swarm-textMuted/50" />
            <p className="text-mini text-swarm-textMuted">No workspaces yet</p>
          </div>
        )}
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          const wsSwarms = agents.filter((b) => b.workspaceId === ws.id);
          const activeSwarms = wsSwarms.filter((b) => agentStatuses[b.id] === "running" || agentStatuses[b.id] === "launching");

          return (
            // `relative` is load-bearing: the delete button below is absolutely
            // positioned, and without a positioned row every row's X stacked in
            // one corner of the panel instead of sitting on its own row.
            <div
              key={ws.id}
              onClick={() => handleActivate(ws.id)}
              {...activatable(() => handleActivate(ws.id), `Workspace ${ws.name}`)}
              aria-current={isActive ? "true" : undefined}
              className={`group relative flex flex-col px-2.5 py-2 pr-7 rounded-lg text-xs cursor-pointer transition-all ${
                isActive
                  ? "bg-swarm-gold/10 text-swarm-goldHi ring-1 ring-swarm-gold/20"
                  : "text-swarm-textDim hover:text-swarm-text hover:bg-swarm-border/40"
              }`}
            >
              <div className="flex items-center gap-2 w-full min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ws.color }}
                />
                {editingWs === ws.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => commitRename(ws.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(ws.id);
                      if (e.key === "Escape") setEditingWs(null);
                    }}
                    spellCheck={false}
                    className="flex-1 bg-transparent border-b border-swarm-gold/40 text-swarm-text text-xs outline-none min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 truncate"
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingWs(ws.id); setEditValue(ws.name); }}
                    // Workspace names are user data of unbounded length: without the
                    // full value in the tooltip a truncated row is unidentifiable.
                    title={`${ws.name}${ws.boundProjectPath ? ` — ${ws.boundProjectPath}` : ""}\nDouble-click to rename`}
                  >
                    {ws.name}
                  </span>
                )}

                {/* Agent count badge */}
                {wsSwarms.length > 0 && (
                  <span className="flex items-center gap-1 text-micro font-mono text-swarm-textMuted bg-swarm-border/30 px-1.5 py-0.5 rounded-full shrink-0">
                    <AgentMark size={10} />
                    {wsSwarms.length}
                  </span>
                )}
              </div>

              {/* Agent status row */}
              {activeSwarms.length > 0 && (
                <div className="flex min-w-0 items-center gap-2 mt-1.5 pl-5">
                  {activeSwarms.slice(0, 3).map((agent) => {
                    // Agent names are user-editable, so each chip has to be able
                    // to shrink — three long ones otherwise push the row past the
                    // fixed 280px panel and clip against its overflow-hidden edge.
                    const label = agent.customName || agent.cliName;
                    return (
                      <span
                        key={agent.id}
                        title={label}
                        className="flex min-w-0 items-center gap-1 text-micro text-swarm-textMuted"
                      >
                        <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${STATUS_DOT[agentStatuses[agent.id] || "idle"]}`} />
                        <span className="truncate">{label}</span>
                      </span>
                    );
                  })}
                  {activeSwarms.length > 3 && (
                    <span className="shrink-0 text-micro text-swarm-textMuted">+{activeSwarms.length - 3}</span>
                  )}
                </div>
              )}

              {/* Task card count */}
              {ws.taskCards.length > 0 && (
                <div className="flex items-center gap-1 mt-1 pl-5">
                  <WorkspaceMark size={9} className="text-swarm-textMuted" />
                  <span className="text-micro text-swarm-textMuted">{ws.taskCards.length} tasks</span>
                </div>
              )}

              {/* Delete button */}
              {workspaces.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }}
                  title={`Close ${ws.name}`}
                  aria-label={`Close ${ws.name}`}
                  // focus-visible keeps the button reachable by keyboard: a purely
                  // hover-gated control is invisible to anyone tabbing through.
                  className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-swarm-err/25 text-swarm-textMuted hover:text-swarm-err transition-all"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {boardOpen && (
        <div className="px-2 py-1 border-t border-swarm-border/30">
          <div className="flex items-center gap-1.5 text-micro text-swarm-goldHi bg-swarm-gold/5 px-2 py-1 rounded-lg">
            <AgentMark size={11} />
            Board active
          </div>
        </div>
      )}

      <div className="p-2 border-t border-swarm-border/50">
        <button
          onClick={handleAdd}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-swarm-gold/10 border border-swarm-gold/20 text-swarm-goldHi hover:bg-swarm-gold/20 transition-colors"
        >
          <Plus size={12} />
          New Workspace
        </button>
      </div>
    </div>
  );
}
