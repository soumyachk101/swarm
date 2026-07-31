"use client";

import { GitBranch, FileCode, AlertTriangle, Link2 } from "lucide-react";
import type { TaskCard, ColumnId } from "../board.js";
import { nodeStatus } from "../pipeline.js";
import type { NodeStatus } from "../pipeline.js";
import { STATUS_COLORS } from "../theme.js";

const COLUMN_META: { id: ColumnId; label: string; color: string }[] = [
  { id: "in-progress", label: "In Progress", color: STATUS_COLORS.active },
  { id: "review",      label: "Review",      color: STATUS_COLORS.review },
  { id: "todo",        label: "Todo",        color: STATUS_COLORS.queued },
  { id: "backlog",     label: "Backlog",     color: STATUS_COLORS.idle },
  { id: "done",        label: "Done",        color: STATUS_COLORS.done },
];

const STATUS_COLOR: Record<NodeStatus, string> = {
  pending: STATUS_COLORS.idle,
  active:  STATUS_COLORS.active,
  review:  STATUS_COLORS.review,
  done:    STATUS_COLORS.done,
  pass:    STATUS_COLORS.done,
  failed:  STATUS_COLORS.failed,
};

export interface TaskListBoardProps {
  tasks: TaskCard[];
  statuses?: Record<string, string>;
}

function TaskRow({ t, statuses }: { t: TaskCard; statuses: Record<string, string> }) {
  const st = nodeStatus(t, t.agentId ? statuses[t.agentId] : undefined);
  return (
    <div className="rounded-md glass-inset px-2.5 py-1.5 transition-colors hover:border-swarm-gold/40">
      <div className="flex items-center gap-2 min-w-0">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[st] }} />
        <span className="flex-1 truncate text-micro font-medium text-swarm-text">{t.title}</span>
        {t.assignedCli && (
          <span className="shrink-0 rounded bg-swarm-gold/10 px-1 py-px text-micro font-bold uppercase tracking-wide text-swarm-gold">
            {t.assignedCli}
          </span>
        )}
        {t.assignedRole && (
          <span className="shrink-0 text-micro uppercase tracking-wide text-swarm-textMuted">
            {t.assignedRole}
          </span>
        )}
      </div>

      {t.description && (
        <div className="mt-0.5 truncate pl-3.5 text-micro leading-[1.35] text-swarm-textMuted">
          {t.description}
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-2.5 pl-3.5 text-micro text-swarm-textMuted">
        {t.worktreeBranch && (
          <span className="flex items-center gap-0.5 truncate">
            <GitBranch className="size-2.5 shrink-0 text-swarm-gold/70" />
            {t.worktreeBranch}
          </span>
        )}
        {t.owns.length > 0 && (
          <span className="flex items-center gap-0.5" title={t.owns.join("\n")}>
            <FileCode className="size-2.5 shrink-0" />
            owns {t.owns.length}
          </span>
        )}
        {t.dependsOn.length > 0 && (
          <span className="flex items-center gap-0.5" title={t.dependsOn.join("\n")}>
            <Link2 className="size-2.5 shrink-0" />
            deps {t.dependsOn.length}
          </span>
        )}
      </div>

      {t.blockingReason && (
        <div className="mt-1 flex items-start gap-1 pl-3.5 text-micro leading-[1.35] text-[#d4796a]">
          <AlertTriangle className="mt-px size-2.5 shrink-0" />
          <span className="truncate">{t.blockingReason}</span>
        </div>
      )}
    </div>
  );
}

export default function TaskListBoard({ tasks, statuses = {} }: TaskListBoardProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-mini text-swarm-textMuted">
        No tasks yet — dispatch a goal to Lead to populate the mission.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-sleek px-4 py-3 space-y-3">
      {COLUMN_META.map((c) => {
        const rows = tasks
          .filter((t) => t.column === c.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (rows.length === 0) return null;
        return (
          <div key={c.id}>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: c.color }} />
              <span className="text-micro font-semibold uppercase tracking-wider text-swarm-textDim">
                {c.label}
              </span>
              <span className="text-micro text-swarm-textMuted">{rows.length}</span>
            </div>
            <div className="mt-1 space-y-1">
              {rows.map((t) => (
                <TaskRow key={t.id} t={t} statuses={statuses} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
