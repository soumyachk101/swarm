"use client";

import { useState, useEffect, useCallback } from "react";
import { X, BarChart3, ListTodo, History, Columns3 } from "lucide-react";
import PipelineBoard from "./PipelineBoard.js";
import ProgressBoard from "./ProgressBoard.js";
import TaskListBoard from "./TaskListBoard.js";
import type { TaskCard } from "../board.js";

interface Props {
  open: boolean;
  tasks: TaskCard[];
  statuses?: Record<string, string>;
  onClose: () => void;
  /** Content for the History tab. Injected so Tasks stays a board package
   *  and never has to know about Pheromone's session store. */
  history?: React.ReactNode;
}

const TABS = [
  { id: "pipeline", label: "Mission Pipeline", icon: Columns3 },
  { id: "progress",  label: "Progress",  icon: BarChart3 },
  { id: "tasks",     label: "Tasks",     icon: ListTodo },
  { id: "history",   label: "History",   icon: History },
];

const MIN_H = 150;
const MAX_H = 560;

export default function TasksPanel({ open, tasks, statuses = {}, onClose, history }: Props) {
  const [activeTab, setActiveTab] = useState("pipeline");
  const [height, setHeight] = useState(240);
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      // Drag up = taller. Panel is anchored to the bottom of the center column.
      setHeight((prev) => {
        const next = prev - e.movementY;
        return Math.max(MIN_H, Math.min(MAX_H, next));
      });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  if (!open) return null;

  return (
    <div
      // No overflow-hidden here: it would clip the -top-1 resize handle and make
      // it ungrabbable. Inner content areas clip themselves.
      className="relative flex flex-col glass-rail border-t border-swarm-border/50 shrink-0"
      style={{ height }}
    >
      {/* Resize handle — top edge, drag to change panel height */}
      <div
        className="absolute -top-1 left-0 right-0 z-20 flex h-2 cursor-row-resize items-center justify-center group"
        onMouseDown={handleResizeStart}
      >
        <div className="h-0.5 w-full bg-transparent transition-colors group-hover:bg-swarm-gold/60 group-active:bg-swarm-gold" />
      </div>

      {/* ── Header + tabs (single row) ─────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-swarm-border/40 shrink-0 pl-3">
        <button
          onClick={onClose}
          className="size-5 rounded flex items-center justify-center text-swarm-textMuted hover:text-swarm-text hover:bg-swarm-border/40 transition-colors shrink-0"
          title="Close Tasks"
        >
          <X className="size-3" />
        </button>
        <span className="text-xs font-semibold text-swarm-gold uppercase tracking-wider shrink-0">
          Tasks
        </span>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-1 flex-1 min-w-0 h-8 px-2 text-mini font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-swarm-goldHi bg-swarm-gold/[0.06] border-b-2 border-swarm-gold"
                  : "text-swarm-textMuted hover:text-swarm-textDim hover:bg-swarm-border/20"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "pipeline" && (
          <PipelineBoard
            open
            tasks={tasks}
            statuses={statuses}
            onClose={onClose}
          />
        )}
        {activeTab === "progress" && <ProgressBoard tasks={tasks} statuses={statuses} />}
        {activeTab === "tasks" && <TaskListBoard tasks={tasks} statuses={statuses} />}
        {activeTab === "history" && history}
      </div>
    </div>
  );
}
