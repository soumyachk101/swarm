"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, FolderOpen } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore, folderName } from "../store.js";

const AGENT_COLORS = ['#c9a227', '#8fae7a', '#7f9db8', '#b79ae0', '#c66b5a', '#7fb3ab'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WorkspaceCreateDialog({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  useEffect(() => {
    if (open) {
      setName("");
      setProjectPath("");
      setCreating(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  const handleBrowse = useCallback(async () => {
    try {
      const apis = { invoke, open: openDialog };
      if (!apis.open) return;
      const folderPath = await apis.open({ directory: true, multiple: false, title: "Select Project Folder" });
      if (folderPath && typeof folderPath === "string") {
        setProjectPath(folderPath);
      }
    } catch (e) {
      console.error("Failed to open folder picker:", e);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    // A name is optional: with a folder picked the agent takes the folder's
    // name, and with neither it starts as "Untitled" and renames itself as soon
    // as a folder is bound. Nothing here should block making a agent.
    if (creating) return;
    setCreating(true);
    const color = AGENT_COLORS[workspaces.length % AGENT_COLORS.length];
    const typed = name.trim();
    addWorkspace({
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: typed || (projectPath ? folderName(projectPath) : "Untitled"),
      autoNamed: !typed,
      color,
      boundProjectPath: projectPath,
      taskCards: [],
    });
    if (projectPath) {
      try {
        const apis = { invoke, open: openDialog };
        if (apis.invoke) {
          await apis.invoke("ensure_pheromone_structure", { projectPath });
        }
      } catch {}
    }
    onClose();
  }, [name, projectPath, creating, workspaces.length, addWorkspace, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCreate();
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [handleCreate, onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-[400px] glass-hi rounded-xl shadow-glassHi animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-swarm-border/50">
          <h2 className="text-sm font-semibold text-swarm-text">New Workspace</h2>
          <button
            onClick={onClose}
            className="size-6 rounded-md flex items-center justify-center text-swarm-textMuted hover:text-swarm-text hover:bg-swarm-border/40 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          <div className="space-y-1">
            <label className="text-mini font-medium text-swarm-textDim uppercase tracking-wider">
              Workspace Name
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave blank to use the folder name"
              className="w-full h-8 px-2.5 rounded-md border border-swarm-border/60 glass-inset text-xs text-swarm-text outline-none focus:border-swarm-gold/60 focus:ring-[1px] focus:ring-swarm-gold/20 placeholder:text-swarm-textMuted/50 transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-mini font-medium text-swarm-textDim uppercase tracking-wider">
              Project Folder (optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="Select or type a folder path"
                className="flex-1 h-8 px-2.5 rounded-md border border-swarm-border/60 glass-inset text-xs text-swarm-text outline-none focus:border-swarm-gold/60 focus:ring-[1px] focus:ring-swarm-gold/20 placeholder:text-swarm-textMuted/50 transition-colors truncate"
              />
              <button
                onClick={handleBrowse}
                className="size-8 rounded-md flex items-center justify-center border border-swarm-border/60 text-swarm-textMuted hover:text-swarm-text hover:bg-swarm-border/40 transition-colors"
                title="Browse for folder"
              >
                <FolderOpen className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-swarm-border/50 glass-toolbar">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-swarm-textDim hover:text-swarm-text hover:bg-swarm-border/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-swarm-gold/15 border border-swarm-gold/25 text-swarm-goldHi hover:bg-swarm-gold/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? "Creating..." : "Create Workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}
