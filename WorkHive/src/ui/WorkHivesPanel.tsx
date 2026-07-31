"use client";

import { useState } from "react";
import { X, Plus, Pin, PinOff } from "lucide-react";
import { activatable, WorkerBeeMark, WorkHiveMark } from "@hiveory/honeyboard";
import { useWorkHiveStore } from "../store.js";
import { useWorkerBeesStore, type AgentStatus } from "@hiveory/worker-bees/ui";

interface WorkHivesPanelProps {
  onClose: () => void;
  docked?: boolean;
  onToggleDock?: () => void;
}

const STATUS_DOT: Record<AgentStatus, string> = {
  launching: "bg-yellow-400 animate-pulse",
  running: "bg-green-400",
  idle: "bg-bee-textMuted",
  error: "bg-red-400",
  done: "bg-bee-gold",
};

export default function WorkHivesPanel({ onClose, docked, onToggleDock }: WorkHivesPanelProps) {
  const workHives = useWorkHiveStore((s) => s.workHives);
  const activeWorkHiveId = useWorkHiveStore((s) => s.activeWorkHiveId);
  const setActiveWorkHive = useWorkHiveStore((s) => s.setActiveWorkHive);
  const addWorkHive = useWorkHiveStore((s) => s.addWorkHive);
  const removeWorkHive = useWorkHiveStore((s) => s.removeWorkHive);
  const updateWorkHive = useWorkHiveStore((s) => s.updateWorkHive);
  const activateAndSync = useWorkHiveStore((s) => s.activateWorkHiveAndSync);
  const workerBees = useWorkerBeesStore((s) => s.workerBees);
  const agentStatuses = useWorkerBeesStore((s) => s.agentStatuses);
  const boardOpen = useWorkHiveStore((s) => s.boardOpen);

  const [editingWs, setEditingWs] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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
    addWorkHive(ws);
  };

  const handleActivate = (id: string) => {
    activateAndSync(id);
    if (!docked) onClose();
  };

  return (
    <div
      className="h-full glass-hi border-r border-bee-border/60 flex flex-col overflow-hidden animate-fade-in"
      style={{ width: "280px", minWidth: "280px" }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-bee-border/50">
        <span className="text-xs font-semibold text-bee-gold uppercase tracking-wider">WorkHives</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleDock}
            className="p-1 rounded-md hover:bg-bee-border/60 text-bee-textMuted hover:text-bee-text transition-colors"
            title={docked ? "Switch to floating overlay" : "Dock to side"}
          >
            {docked ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-bee-border/60 text-bee-textMuted hover:text-bee-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {workHives.map((ws) => {
          const isActive = ws.id === activeWorkHiveId;
          const wsBees = workerBees.filter((b) => b.workHiveId === ws.id);
          const activeBees = wsBees.filter((b) => agentStatuses[b.id] === "running" || agentStatuses[b.id] === "launching");

          return (
            <div
              key={ws.id}
              onClick={() => handleActivate(ws.id)}
              {...activatable(() => handleActivate(ws.id), `Workhive ${ws.name}`)}
              aria-current={isActive ? "true" : undefined}
              className={`group flex flex-col px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                isActive
                  ? "bg-bee-gold/10 text-bee-goldHi ring-1 ring-bee-gold/20"
                  : "text-bee-textDim hover:text-bee-text hover:bg-bee-border/40"
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
                    onBlur={() => { updateWorkHive(ws.id, { name: editValue }); setEditingWs(null); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { updateWorkHive(ws.id, { name: editValue }); setEditingWs(null); }
                      if (e.key === "Escape") setEditingWs(null);
                    }}
                    className="flex-1 bg-transparent border-b border-bee-gold/40 text-bee-text text-xs outline-none min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="truncate flex-1"
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingWs(ws.id); setEditValue(ws.name); }}
                    title="Double-click to rename"
                  >
                    {ws.name}
                  </span>
                )}

                {/* Agent count badge */}
                {wsBees.length > 0 && (
                  <span className="flex items-center gap-1 text-micro font-mono text-bee-textMuted bg-bee-border/30 px-1.5 py-0.5 rounded-full shrink-0">
                    <WorkerBeeMark size={10} />
                    {wsBees.length}
                  </span>
                )}
              </div>

              {/* Agent status row */}
              {activeBees.length > 0 && (
                <div className="flex items-center gap-2 mt-1.5 pl-5">
                  {activeBees.slice(0, 3).map((bee) => (
                    <span
                      key={bee.id}
                      className="flex items-center gap-1 text-micro text-bee-textMuted"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agentStatuses[bee.id] || "idle"]}`} />
                      {bee.customName || bee.cliName}
                    </span>
                  ))}
                  {activeBees.length > 3 && (
                    <span className="text-micro text-bee-textMuted">+{activeBees.length - 3}</span>
                  )}
                </div>
              )}

              {/* Task card count */}
              {ws.taskCards.length > 0 && (
                <div className="flex items-center gap-1 mt-1 pl-5">
                  <WorkHiveMark size={9} className="text-bee-textMuted" />
                  <span className="text-micro text-bee-textMuted">{ws.taskCards.length} tasks</span>
                </div>
              )}

              {/* Delete button */}
              {workHives.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeWorkHive(ws.id); }}
                  className="absolute right-2 top-2 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bee-err/25 text-bee-textMuted hover:text-bee-err transition-all"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {boardOpen && (
        <div className="px-2 py-1 border-t border-bee-border/30">
          <div className="flex items-center gap-1.5 text-micro text-bee-goldHi bg-bee-gold/5 px-2 py-1 rounded-lg">
            <WorkerBeeMark size={11} />
            Board active
          </div>
        </div>
      )}

      <div className="p-2 border-t border-bee-border/50">
        <button
          onClick={handleAdd}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bee-gold/10 border border-bee-gold/20 text-bee-goldHi hover:bg-bee-gold/20 transition-colors"
        >
          <Plus size={12} />
          New Workspace
        </button>
      </div>
    </div>
  );
}
