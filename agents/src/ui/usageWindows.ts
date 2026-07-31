// Pure maths behind the usage meters — no React, so the window arithmetic can
// be tested directly (see usageWindows.test.ts).

/**
 * Time until a rolling block rolls over. Anchored to when the block OPENED
 * (its first message), not the last one — a quota window doesn't slide forward
 * every time you type.
 */
export function resetsIn(startedAt: number, windowMs: number): string | null {
  if (!startedAt) return null;
  const left = startedAt + windowMs - Date.now();
  if (left <= 0) return null;
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const mins = Math.floor((left % 3_600_000) / 60_000);
  if (days) return `${days}d ${hours}h`;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}
