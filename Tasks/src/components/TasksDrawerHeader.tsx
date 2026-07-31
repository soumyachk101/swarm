import { X } from 'lucide-react';

interface Props { selectedCount: number; onClose: () => void; }

export default function TasksDrawerHeader({ selectedCount, onClose }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-swarm-border/50 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-swarm-gold uppercase tracking-wider">Workspace Board</span>
        {selectedCount > 0 && (
          <span className="text-micro font-mono text-swarm-goldHi bg-swarm-gold/10 px-1.5 py-0.5 rounded-full border border-swarm-gold/20">
            {selectedCount} selected
          </span>
        )}
      </div>
      <button onClick={onClose} className="p-1 rounded-md hover:bg-swarm-border/60 text-swarm-textMuted hover:text-swarm-text transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}
