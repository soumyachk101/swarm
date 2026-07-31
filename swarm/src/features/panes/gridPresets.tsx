import type { GridLayout } from "@swarm/agents/ui";

/**
 * Pane grid presets shown in the drag-to-top snap picker.
 *
 * Two families, plus Focus:
 *  - Column presets (cols2/3/4): N columns, each row is full plane height, so
 *    panes stay large and the plane scrolls once there are more than N.
 *  - Grid presets (NxM): N columns and M rows fill one screen exactly; panes
 *    shrink to fit and extra panes scroll below.
 *  - Focus: a spotlight pane (2 columns wide) with the rest stacked in the
 *    third column.
 * `rows` = rows-per-screen (a grid preset's M); undefined ⇒ 1 (column preset).
 */
export interface GridPreset {
  id: GridLayout;
  label: string;
  cols: number;
  rows?: number;
  focus?: boolean;
}

export const GRID_PRESETS: GridPreset[] = [
  { id: "cols2", label: "2 columns", cols: 2 },
  { id: "cols3", label: "3 columns", cols: 3 },
  { id: "cols4", label: "4 columns", cols: 4 },
  { id: "grid2x2", label: "2×2 grid", cols: 2, rows: 2 },
  { id: "grid3x2", label: "3×2 grid", cols: 3, rows: 2 },
  { id: "grid4x2", label: "4×2 grid", cols: 4, rows: 2 },
  { id: "focus", label: "Focus", cols: 3, focus: true },
  { id: "focus4", label: "Focus ×4", cols: 4, focus: true },
];

export function presetFor(id: GridLayout): GridPreset | undefined {
  return GRID_PRESETS.find((p) => p.id === id);
}

/** Mini grid thumbnail matching the reference tiles. */
export function PresetThumb({
  cols,
  rows = 1,
  active = false,
  focus = false,
  focusWide = false,
  size = 40,
}: {
  cols: number;
  rows?: number;
  active?: boolean;
  focus?: boolean;
  focusWide?: boolean;
  size?: number;
}) {
  const cell = active ? "bg-swarm-gold/70" : "bg-swarm-textMuted/40";
  const box = `rounded-md border p-[3px] transition-colors ${
    active ? "border-swarm-gold/70 bg-swarm-gold/15" : "border-swarm-border/70 glass-inset"
  }`;

  if (focus) {
    // big spotlight + two stacked cells on the right (wider spotlight for ×4)
    return (
      <div className={`grid gap-[2px] ${box}`} style={{ width: size, height: size * 0.72, gridTemplateColumns: focusWide ? "1fr 1fr" : "2fr 1fr", gridTemplateRows: "1fr 1fr" }}>
        <div className={`row-span-2 rounded-sm ${cell}`} />
        <div className={`rounded-sm ${cell}`} />
        <div className={`rounded-sm ${cell}`} />
      </div>
    );
  }

  const cells = cols * rows;
  return (
    <div
      className={`grid gap-[2px] ${box}`}
      style={{
        width: size,
        height: size * 0.72,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {Array.from({ length: cells }, (_, i) => (
        <div key={i} className={`rounded-sm ${cell}`} />
      ))}
    </div>
  );
}
