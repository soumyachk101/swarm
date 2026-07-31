"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { activatable } from "@swarm/board";
import { useWorkspaceStore } from "../store.js";
import { useAgentsStore } from "@swarm/agents/ui";

function randomColor() {
  const colors = ['#c9a227', '#8fae7a', '#7f9db8', '#b79ae0', '#c66b5a', '#7fb3ab', '#c98fae', '#d99a1c'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function nextId() {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function WorkspaceTabStrip() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);

  const agents = useAgentsStore((s) => s.agents);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  // The strip scrolls horizontally, so with enough workspaces the active one can
  // sit off-screen — switching by keyboard or from another surface would look
  // like nothing happened. Pull it back into view whenever selection changes.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeWorkspaceId, workspaces.length]);

  const handleAdd = () => {
    const ws = {
      id: nextId(),
      name: "Untitled",
      autoNamed: true,
      color: randomColor(),
      boundProjectPath: "",
      taskCards: [],
    };
    addWorkspace(ws);
  };

  const handleRemove = (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (ws && agents.some((b) => b.workspaceId === ws.id)) {
      const ok = confirm(`"${ws.name}" has running agents. Are you sure?`);
      if (!ok) return;
    }
    removeWorkspace(id);
  };

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const saveRename = (id: string) => {
    if (editValue.trim()) {
      renameWorkspace(id, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    // `no-scrollbar` was never defined anywhere in the stylesheet, so this 36px
    // strip has been rendering a native horizontal scrollbar across its bottom
    // edge. Hide it inline instead of inventing another global utility.
    <div className="glass-toolbar border-b border-swarm-border/60 flex items-center h-9 px-2 gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-shrink-0">
      {workspaces.map((ws) => {
        const isActive = ws.id === activeWorkspaceId;
        return (
          // shrink-0, not min-w-0: the strip is overflow-x-auto, and letting tabs
          // flex-shrink meant a dozen workspaces squashed into unreadable slivers
          // instead of scrolling.
          <div
            key={ws.id}
            ref={isActive ? activeTabRef : undefined}
            onClick={() => setActiveWorkspace(ws.id)}
            {...activatable(() => setActiveWorkspace(ws.id), `Switch to workspace ${ws.name}`)}
            aria-current={isActive ? "true" : undefined}
            className={`group relative flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all select-none whitespace-nowrap ${
              isActive
                ? "bg-swarm-gold/10 text-swarm-goldHi shadow-[inset_0_-1px_0_rgb(var(--swarm-gold))]"
                : "text-swarm-textDim hover:text-swarm-text hover:bg-swarm-border/40"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: ws.color }}
            />
            {editingId === ws.id ? (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => saveRename(ws.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename(ws.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="glass-inset text-swarm-text px-1.5 py-0.5 rounded text-xs w-24 outline-none focus:ring-1 focus:ring-swarm-gold"
                autoFocus
              />
            ) : (
              <span
                className="truncate max-w-[100px]"
                title={`${ws.name}${ws.boundProjectPath ? ` — ${ws.boundProjectPath}` : ""}`}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(ws.id, ws.name);
                }}
              >
                {ws.name}
              </span>
            )}
            {agents.filter((b) => b.workspaceId === ws.id).length > 0 && (
              <span className="text-micro text-swarm-textMuted font-mono">
                ({agents.filter((b) => b.workspaceId === ws.id).length})
              </span>
            )}
            {workspaces.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(ws.id);
                }}
                title={`Close ${ws.name}`}
                aria-label={`Close ${ws.name}`}
                // Stays visible on the active tab and on keyboard focus: a
                // hover-only close is unreachable without a pointer, and a 11px
                // glyph in a 0-padding box is a near-impossible click target.
                className={`ml-0.5 flex size-5 shrink-0 items-center justify-center rounded hover:bg-swarm-err/25 text-swarm-textMuted hover:text-swarm-err transition-all focus-visible:opacity-100 group-hover:opacity-100 ${
                  isActive ? "opacity-70" : "opacity-0"
                }`}
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={handleAdd}
        // sticky: once the strip overflows, a trailing "+" scrolls out of reach
        // and there is no other way to add a workspace from here.
        className="sticky right-0 p-1.5 rounded-lg bg-swarm-surface text-swarm-textMuted hover:text-swarm-goldHi hover:bg-swarm-gold/10 transition-colors flex-shrink-0 ml-0.5"
        title="New workspace"
        aria-label="New workspace"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
