/**
 * Swarm's own marks. Every concept the product invented gets a drawn mark,
 * never a stock glyph: an agent is not a robot, a workspace is not a plain
 * folder, Pheromone is not a database cylinder, Tasks is not a kanban board.
 *
 * All are lucide-compatible: 24x24 viewBox, `currentColor`, sized via `size`.
 * Hexagon vertices are computed geometry, not eyeballed.
 */

interface MarkProps {
  size?: number;
  className?: string;
  /** Filled treatment for the active/selected state. */
  filled?: boolean;
}

const base = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  className,
  "aria-hidden": true as const,
  style: { flexShrink: 0 },
});

/** A worker of the swarm: striped abdomen, two wings, antennae. */
export function AgentMark({ size = 16, className, filled }: MarkProps) {
  return (
    <svg
      {...base(size, className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* wings, drawn behind the body */}
      <path d="M9.1 9.5C6.7 6.5 3.4 6.4 3.2 8.6c-.2 2.1 2.8 3.4 5.4 2.5" opacity={0.75} />
      <path d="M14.9 9.5c2.4-3 5.7-3.1 5.9-.9.2 2.1-2.8 3.4-5.4 2.5" opacity={0.75} />
      {/* antennae */}
      <path d="M10.5 7.2 9.3 5.1M13.5 7.2l1.2-2.1" />
      {/* body */}
      <path
        d="M8.2 11.4c0-2.2 1.7-3.6 3.8-3.6s3.8 1.4 3.8 3.6v3.4c0 2.8-1.7 4.6-3.8 4.6s-3.8-1.8-3.8-4.6z"
        fill={filled ? "currentColor" : "none"}
        opacity={filled ? 0.18 : 1}
      />
      <path
        d="M8.2 11.4c0-2.2 1.7-3.6 3.8-3.6s3.8 1.4 3.8 3.6v3.4c0 2.8-1.7 4.6-3.8 4.6s-3.8-1.8-3.8-4.6z"
        fill="none"
      />
      {/* stripes */}
      <path d="M8.3 12.9h7.4M8.8 15.9h6.4" />
    </svg>
  );
}

/** A workspace: one outer cell holding the three cells it nests. */
export function WorkspaceMark({ size = 16, className, filled }: MarkProps) {
  return (
    <svg
      {...base(size, className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
    >
      <path d="M19.79 16.50 L12.00 21.00 L4.21 16.50 L4.21 7.50 L12.00 3.00 L19.79 7.50 Z" />
      <g strokeWidth={1.2} fill={filled ? "currentColor" : "none"} opacity={filled ? 0.9 : 0.6}>
        <path d="M14.60 9.00 L12.00 10.50 L9.40 9.00 L9.40 6.00 L12.00 4.50 L14.60 6.00 Z" />
        <path d="M12.00 15.75 L9.40 17.25 L6.80 15.75 L6.80 12.75 L9.40 11.25 L12.00 12.75 Z" />
        <path d="M17.20 15.75 L14.60 17.25 L12.00 15.75 L12.00 12.75 L14.60 11.25 L17.20 12.75 Z" />
      </g>
    </svg>
  );
}

/** Pheromone: a droplet holding a stored spark. Memory, not a database. */
export function PheromoneMark({ size = 16, className, filled }: MarkProps) {
  return (
    <svg
      {...base(size, className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M12 2.8c0 0 6.6 7.4 6.6 11.6A6.6 6.6 0 0 1 5.4 14.4C5.4 10.2 12 2.8 12 2.8Z"
        fill={filled ? "currentColor" : "none"}
        opacity={filled ? 0.18 : 1}
      />
      <path d="M12 2.8c0 0 6.6 7.4 6.6 11.6A6.6 6.6 0 0 1 5.4 14.4C5.4 10.2 12 2.8 12 2.8Z" fill="none" />
      <path d="M9.4 14.6a2.6 2.6 0 0 0 2.6 2.6" opacity={0.8} />
    </svg>
  );
}

/** Tasks: four packed cells, the board's own mark. */
export function TasksMark({ size = 16, className, filled }: MarkProps) {
  return (
    <svg
      {...base(size, className)}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d="M12.00 10.40 L8.54 12.40 L5.07 10.40 L5.07 6.40 L8.54 4.40 L12.00 6.40 Z" />
      <path d="M18.93 10.40 L15.46 12.40 L12.00 10.40 L12.00 6.40 L15.46 4.40 L18.93 6.40 Z" opacity={0.55} />
      <path d="M12.00 17.60 L8.54 19.60 L5.07 17.60 L5.07 13.60 L8.54 11.60 L12.00 13.60 Z" opacity={0.55} />
      <path d="M18.93 17.60 L15.46 19.60 L12.00 17.60 L12.00 13.60 L15.46 11.60 L18.93 13.60 Z" />
    </svg>
  );
}
