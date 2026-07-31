/**
 * The Lead mark. Not a crown: crowns are everywhere and say "premium",
 * not "this agent leads the swarm". This is the lead herself, sharing the
 * AgentMark silhouette exactly so promoting a worker reads as the same
 * creature elevated, with two things only she has: a royal arc fused above
 * the wings, and the royal-cell diamond on her thorax.
 *
 * Lucide-compatible: sized via `size` or a CSS class.
 */
export default function LeadCrown({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Royal arc: the rank marker, readable even at 12px. */}
      <path d="M4.8 8.1 6.6 4.9 9.1 7.1 12 3.2 14.9 7.1 17.4 4.9 19.2 8.1" strokeWidth={1.5} />
      <circle cx="12" cy="3.1" r="1.05" fill="currentColor" stroke="none" />

      {/* Wings, swept back from under the arc. */}
      <path d="M9.3 11.6C7.1 9.9 4.7 10.3 4.8 12c.1 1.7 2.5 2.6 4.6 2" opacity={0.7} />
      <path d="M14.7 11.6c2.2-1.7 4.6-1.3 4.5.4-.1 1.7-2.5 2.6-4.6 2" opacity={0.7} />

      {/* Body: same geometry as AgentMark. */}
      <path d="M8.5 12.6c0-1.9 1.5-3.1 3.5-3.1s3.5 1.2 3.5 3.1v3c0 2.5-1.5 4.1-3.5 4.1s-3.5-1.6-3.5-4.1z" />

      {/* Royal cell: the diamond only the lead carries. */}
      <path d="M12 11.7 13.4 13.6 12 15.5 10.6 13.6Z" fill="currentColor" stroke="none" />
      <path d="M8.9 17h6.2" />
    </svg>
  );
}
