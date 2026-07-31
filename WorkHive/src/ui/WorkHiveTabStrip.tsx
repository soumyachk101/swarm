"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { activatable } from "@hiveory/honeyboard";
import { useWorkHiveStore } from "../store.js";
import { useWorkerBeesStore } from "@hiveory/worker-bees/ui";

function randomColor() {
  const colors = ['#c9a227', '#8fae7a', '#7f9db8', '#b79ae0', '#c66b5a', '#7fb3ab', '#c98fae', '#d99a1c'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function nextId() {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function WorkHiveTabStrip() {
  const workHives = useWorkHiveStore((s) => s.workHives);
  const activeWorkHiveId = useWorkHiveStore((s) => s.activeWorkHiveId);
  const addWorkHive = useWorkHiveStore((s) => s.addWorkHive);
  const removeWorkHive = useWorkHiveStore((s) => s.removeWorkHive);
  const setActiveWorkHive = useWorkHiveStore((s) => s.setActiveWorkHive);
  const renameWorkHive = useWorkHiveStore((s) => s.renameWorkHive);

  const workerBees = useWorkerBeesStore((s) => s.workerBees);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const activeWs = workHives.find((w) => w.id === activeWorkHiveId);

  const handleAdd = () => {
    const ws = {
      id: nextId(),
      name: "Untitled",
      autoNamed: true,
      color: randomColor(),
      boundProjectPath: "",
      taskCards: [],
    };
    addWorkHive(ws);
  };

  const handleRemove = (id: string) => {
    const ws = workHives.find((w) => w.id === id);
    if (ws && workerBees.some((b) => b.workHiveId === ws.id)) {
      const ok = confirm(`"${ws.name}" has running agents. Are you sure?`);
      if (!ok) return;
    }
    removeWorkHive(id);
  };

  const startRename = (id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const saveRename = (id: string) => {
    if (editValue.trim()) {
      renameWorkHive(id, editValue.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="glass-toolbar border-b border-bee-border/60 flex items-center h-9 px-2 gap-0.5 overflow-x-auto no-scrollbar flex-shrink-0">
      {workHives.map((ws) => {
        const isActive = ws.id === activeWorkHiveId;
        return (
          <div
            key={ws.id}
            onClick={() => setActiveWorkHive(ws.id)}
            {...activatable(() => setActiveWorkHive(ws.id), `Switch to workhive ${ws.name}`)}
            aria-current={isActive ? "true" : undefined}
            className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all select-none whitespace-nowrap min-w-0 ${
              isActive
                ? "bg-bee-gold/10 text-bee-goldHi shadow-[inset_0_-1px_0_rgb(var(--bee-gold))]"
                : "text-bee-textDim hover:text-bee-text hover:bg-bee-border/40"
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
                className="glass-inset text-bee-text px-1.5 py-0.5 rounded text-xs w-24 outline-none focus:ring-1 focus:ring-bee-gold"
                autoFocus
              />
            ) : (
              <span
                className="truncate max-w-[100px]"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startRename(ws.id, ws.name);
                }}
              >
                {ws.name}
              </span>
            )}
            {workerBees.filter((b) => b.workHiveId === ws.id).length > 0 && (
              <span className="text-micro text-bee-textMuted font-mono">
                ({workerBees.filter((b) => b.workHiveId === ws.id).length})
              </span>
            )}
            {workHives.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(ws.id);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bee-err/25 text-bee-textMuted hover:text-bee-err transition-all ml-0.5"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}

      <button
        onClick={handleAdd}
        className="p-1.5 rounded-lg text-bee-textMuted hover:text-bee-goldHi hover:bg-bee-gold/10 transition-colors flex-shrink-0 ml-0.5"
        title="New workhive"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
