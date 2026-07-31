/**
 * The Board mark. Board is the strip that carries panes between planes, so the
 * mark is what that actually is: three packed cells with work moving through
 * the middle one. A lone hexagon just said "cell"; this says "work moving
 * across the board", which is the thing being named.
 *
 * Vertices are computed flat-top hexagons (r = 4.3, pitch 1.5r), so the row
 * tessellates properly instead of being eyeballed.
 */
export default function BoardLogo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      /* role="img" is required for aria-label to survive: without it screen
         readers treat an <svg> as a generic group and drop the name. */
      role="img"
      aria-label="Board"
    >
      <g stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        {/* Emptied cell, the pane that just left. */}
        <path d="M9.85 8.28 L7.70 12.00 L3.40 12.00 L1.25 8.28 L3.40 4.55 L7.70 4.55 Z" opacity="0.4" />
        {/* Receiving cell, the pane that just arrived. */}
        <path d="M22.75 8.28 L20.60 12.00 L16.30 12.00 L14.15 8.28 L16.30 4.55 L20.60 4.55 Z" opacity="0.4" />
        {/* The cell in transit. */}
        <path d="M16.30 12.00 L14.15 15.72 L9.85 15.72 L7.70 12.00 L9.85 8.28 L14.15 8.28 Z" />
      </g>
      {/* The payload itself, mid-flow. */}
      <path
        d="M12 9.4c0 0 2.15 2.7 2.15 4.05a2.15 2.15 0 0 1-4.3 0C9.85 12.1 12 9.4 12 9.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
