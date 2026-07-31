import type { GridLayout } from "@swarm/agents/ui";

/**
 * Pane grid presets shown in the drag-to-top snap picker.
 *
 * Two families, plus Focus and Auto:
 *  - Auto: columns and rows follow the pane count AND the plane's shape (see
 *    autoCols). The only preset that leaves no empty cells at most counts.
 *  - Column presets (cols2/3/4): N columns, each row is full plane height, so
 *    panes stay large and the plane scrolls once there are more than N.
 *  - Grid presets (NxM): N columns and M rows fill one screen exactly; panes
 *    shrink to fit and extra panes scroll below.
 *  - Focus: a tall spotlight pane with two panes stacked beside it; anything
 *    past those three flows into a 4-wide block below and scrolls. (Focus ×4
 *    only widens the side column — the spotlight keeps half the width.)
 * `rows` = rows-per-screen (a grid preset's M); undefined ⇒ 1 (column preset).
 * The host caps rows-per-screen at the number of rows the panes actually fill,
 * so a preset never reserves height for a row that has nothing in it.
 */
export interface GridPreset {
  id: GridLayout;
  label: string;
  cols: number;
  rows?: number;
  focus?: boolean;
  /** Host computes cols/rows from the pane count and plane shape. */
  auto?: boolean;
}

/**
 * Columns for the Auto layout, from the pane count and the plane's aspect
 * ratio (width / height of the body, gutters included).
 *
 * A lookup, not a formula: the formula answers (round(sqrt(count * aspect /
 * target))) are only defensible half the time, and this is the table someone
 * has to reason about at 3am. Read a row as "with this many panes, use this
 * many columns" — counts past 8 all sit in the last column.
 *
 * The shapes are chosen so the last row is full wherever the count allows it
 * (3 panes wide ⇒ 3 columns, not 2×2 with a hole), because an empty cell on a
 * board is exactly the dead space Auto exists to avoid.
 */
export function autoCols(count: number, aspect: number): number {
  if (count <= 1) return 1;
  //                        panes: 1  2  3  4  5  6  7  8+
  const wide /*  ≥ 16:9  */ = [1, 2, 3, 2, 3, 3, 4, 4];
  const mid /*   ~ 4:3   */ = [1, 2, 2, 2, 3, 3, 3, 4];
  const tall /*  portrait*/ = [1, 1, 2, 2, 2, 2, 3, 3];
  const row = aspect >= 1.7 ? wide : aspect >= 1.1 ? mid : tall;
  return row[Math.min(count, 8) - 1];
}

export const GRID_PRESETS: GridPreset[] = [
  { id: "auto", label: "Auto", cols: 2, auto: true },
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
