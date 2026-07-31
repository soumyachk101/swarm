/**
 * The Flow mark: nodes scattered in open space, linked. It has to read as
 * "a canvas of connected work" next to Board's "cells in a grid", because
 * those two marks are the whole toggle.
 */
export default function FlowMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    // role="img" is required for aria-label to survive: without it screen
    // readers treat an <svg> as a generic group and drop the name.
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} role="img" aria-label="Flow">
      <path d="M8.4 7.6 15.2 5.6M9 10.6l5.4 5.2M16.4 8.2l1.2 5.6"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
      <rect x="3.2" y="4.4" width="6" height="4.4" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14.6" y="3.2" width="6.2" height="4.6" rx="1.3" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
      <rect x="13.4" y="14.2" width="7.4" height="5.6" rx="1.4" fill="currentColor" opacity="0.9" />
      <rect x="3.6" y="12.4" width="5.4" height="4.2" rx="1.2" stroke="currentColor" strokeWidth="1.5" opacity="0.65" />
    </svg>
  );
}
