"use client";

import { useState } from "react";
import { GitBranch, Plus, Trash2, LoaderCircle, X, Check } from "lucide-react";
import { useWorkspaceStore, type Workspace } from "../store.js";

/**
 * Per-agent git worktree ("tree") manager: list existing trees and create
 * new ones. Each tree is a separate checked-out directory on its own branch, so
 * agents assigned to different trees never step on each other.
 */
export default function WorkspaceTrees({ agent }: { agent: Workspace }) {
  const createWorktree = useWorkspaceStore((s) => s.createWorktree);
  const removeWorktree = useWorkspaceStore((s) => s.removeWorktree);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const trees = agent.worktrees ?? [];
  const noRepo = !agent.boundProjectPath;

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createWorktree(agent.id, name);
      setName("");
      setAdding(false);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setRemovingId(id);
    setError(null);
    try {
      await removeWorktree(agent.id, id);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="px-3 py-2 glass-toolbar border-b border-swarm-border/10">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-micro font-semibold uppercase tracking-wider text-swarm-textMuted">Trees</span>
        <button
          onClick={(e) => { e.stopPropagation(); setAdding((v) => !v); setError(null); }}
          disabled={noRepo}
          title={noRepo ? "Bind a repo to this agent first" : "New tree (git worktree)"}
          className="flex items-center gap-1 rounded bg-swarm-gold/10 px-1.5 py-0.5 text-micro font-medium text-swarm-goldHi hover:bg-swarm-gold/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="size-2.5" /> New tree
        </button>
      </div>

      {adding && (
        <div className="mb-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") { setAdding(false); setName(""); }
            }}
            placeholder="tree name (e.g. feature-x)"
            className="min-w-0 flex-1 rounded border border-swarm-border/60 glass-inset px-2 py-1 text-mini text-swarm-text outline-none focus:border-swarm-gold/50"
          />
          <button onClick={submit} disabled={busy || !name.trim()} className="size-6 rounded flex items-center justify-center text-swarm-goldHi hover:bg-swarm-gold/15 disabled:opacity-40" title="Create">
            {busy ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3" />}
          </button>
          <button onClick={() => { setAdding(false); setName(""); }} className="size-6 rounded flex items-center justify-center text-swarm-textMuted hover:text-swarm-text" title="Cancel">
            <X className="size-3" />
          </button>
        </div>
      )}

      {error && <div className="mb-1.5 text-micro text-swarm-err break-words">{error}</div>}

      {trees.length === 0 && !adding ? (
        <div className="text-micro text-swarm-textMuted/70">No trees — all agents share the main repo.</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {trees.map((t) => (
            <div key={t.id} className="group flex items-center gap-1.5 rounded px-1.5 py-1 text-mini text-swarm-textDim hover:bg-swarm-border/20">
              <GitBranch className="size-3 shrink-0 text-swarm-gold" />
              <span className="truncate font-medium text-swarm-text" title={t.path}>{t.name}</span>
              <span className="truncate text-micro text-swarm-textMuted/70">{t.branch}</span>
              <button
                onClick={(e) => { e.stopPropagation(); remove(t.id); }}
                disabled={removingId === t.id}
                className="ml-auto size-5 shrink-0 rounded flex items-center justify-center text-swarm-textMuted opacity-0 group-hover:opacity-100 hover:text-swarm-err hover:bg-swarm-err/15 transition-all"
                title="Remove tree"
              >
                {removingId === t.id ? <LoaderCircle className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
