import { Clock } from 'lucide-react';
import type { TaskCard } from '../board.js';

interface Props {
  task: TaskCard;
  isSelected: boolean;
  onPointerDownCapture?: (e: React.PointerEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

const ROLE_DOT: Record<string, string> = {
  builder: 'bg-swarm-gold', reviewer: 'bg-swarm-amber', scout: 'bg-swarm-honey', coordinator: 'bg-swarm-err',
};

export default function TasksCard({ task, isSelected, onPointerDownCapture, onClick }: Props) {
  return (
    <div
      data-agent-board-card-id={task.id}
      data-agent-board-card-selected={isSelected ? 'true' : undefined}
      data-agent-board-pointer-draggable="true"
      onPointerDownCapture={onPointerDownCapture}
      onClick={onClick}
      // Drag needs a pointer, but selecting a card must not. Enter/Space select.
      role="button"
      tabIndex={0}
      aria-label={task.title}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(e as unknown as React.MouseEvent);
        }
      }}
      className={`glass-hi rounded-lg p-2.5 space-y-1.5 cursor-grab active:cursor-grabbing transition-all duration-150 ${
        isSelected ? 'ring-1 ring-swarm-gold/60 shadow-[0_0_12px_rgb(var(--swarm-gold)/0.25)]' : 'hover:shadow-glass-lg'
      }`}
    >
      <span className="text-mini font-medium text-swarm-text leading-snug block">{task.title}</span>
      {task.description && (
        <p className="text-micro text-swarm-textMuted leading-relaxed line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        {task.assignedRole && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-medium bg-swarm-gold/10 text-swarm-goldHi border border-swarm-gold/20">
            <span className={`w-1 h-1 rounded-full ${ROLE_DOT[task.assignedRole] || 'bg-swarm-textMuted'}`} />
            {task.assignedRole}
          </span>
        )}
        {task.assignedCli && (
          <span className="text-micro font-mono text-swarm-textMuted">{task.assignedCli}</span>
        )}
      </div>
      {task.blockingReason && (
        <div className="flex items-center gap-1 text-micro text-swarm-warn bg-swarm-warn/10 px-1.5 py-0.5 rounded">
          <Clock size={8} />
          waiting on: {task.blockingReason}
        </div>
      )}
    </div>
  );
}
