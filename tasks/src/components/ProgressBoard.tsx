"use client";

import type { TaskCard, ColumnId } from "../board.js";
import { buildPipeline } from "../pipeline.js";
import type { NodeStatus } from "../pipeline.js";
import { STATUS_COLORS } from "../theme.js";

/* ── Column + status palettes (match the pipeline board) ─────── */

const COLUMN_META: { id: ColumnId; label: string; color: string }[] = [
  { id: "backlog",     label: "Backlog",     color: STATUS_COLORS.idle },
  { id: "todo",        label: "Todo",        color: STATUS_COLORS.queued },
  { id: "in-progress", label: "In Progress", color: STATUS_COLORS.active },
  { id: "review",      label: "Review",      color: STATUS_COLORS.review },
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

export interface ProgressBoardProps {
  tasks: TaskCard[];
  statuses?: Record<string, string>;
}

export default function ProgressBoard({ tasks, statuses = {} }: ProgressBoardProps) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.column === "done").length;
  const blocked = tasks.filter((t) => t.blockingReason).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const stages = buildPipeline(tasks, statuses);

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-mini text-swarm-textMuted">
        No tasks yet — dispatch a goal to Lead to populate the mission.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-sleek px-4 py-3">
      {/* ── Overall completion ─────────────────────────────── */}
      <div className="flex items-baseline justify-between">
        <span className="text-mini font-semibold text-swarm-text">Mission progress</span>
        <span className="text-mini text-swarm-textMuted">
          <span className="text-swarm-gold font-semibold">{done}</span> / {total} done
          {blocked > 0 && <span className="ml-2 text-[#d4796a]">{blocked} blocked</span>}
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-swarm-border/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-swarm-gold to-swarm-goldHi transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 text-micro text-swarm-textMuted">{pct}% complete</div>

      {/* ── Per-column counts ──────────────────────────────── */}
      <div className="mt-4 grid grid-cols-5 gap-1.5">
        {COLUMN_META.map((c) => {
          const n = tasks.filter((t) => t.column === c.id).length;
          return (
            <div
              key={c.id}
              className="rounded-md border border-swarm-border/40 glass-inset px-2 py-1.5"
            >
              <div className="flex items-center gap-1">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="truncate text-micro uppercase tracking-wide text-swarm-textMuted">
                  {c.label}
                </span>
              </div>
              <div className="mt-0.5 text-sm font-semibold text-swarm-text">{n}</div>
            </div>
          );
        })}
      </div>

      {/* ── Stage rundown ──────────────────────────────────── */}
      <div className="mt-4 text-micro font-semibold uppercase tracking-wider text-swarm-gold">
        Stages
      </div>
      <div className="mt-1.5 space-y-1">
        {stages.map((s) => {
          const st = s.nodes[0]?.status ?? "pending";
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md glass-inset px-2.5 py-1.5"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: STATUS_COLOR[st] }}
              />
              <span className="w-24 shrink-0 truncate text-micro font-medium text-swarm-text">
                {s.title}
              </span>
              <span className="flex-1 truncate text-micro text-swarm-textMuted">{s.statusText}</span>
              <span
                className="shrink-0 rounded px-1 py-px text-micro font-bold uppercase tracking-wide"
                style={{ background: `${STATUS_COLOR[st]}1f`, color: STATUS_COLOR[st] }}
              >
                {st}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
