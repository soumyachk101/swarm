import { describe, it, expect, vi, afterEach } from "vitest";
import { resetsIn } from "./usageWindows.js";

// A rolling quota block resets `window` after it OPENED. Anchoring to the last
// message instead makes the reset slide forward on every keystroke, so it never
// arrives — the bug that showed "4h 55m" when the real answer was "2h 2m".
const NOW = Date.parse("2026-07-28T12:00:00.000Z");

afterEach(() => vi.useRealTimers());

function at(now: number) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
}

describe("resetsIn", () => {
  it("counts down from when the block opened, not from the last message", () => {
    at(NOW);
    const openedAt = NOW - 178 * 60_000; // first message 2h58m ago
    expect(resetsIn(openedAt, 5 * 3_600_000)).toBe("2h 2m");
  });

  it("does not slide forward as new messages land", () => {
    at(NOW);
    const openedAt = NOW - 3 * 3_600_000;
    const before = resetsIn(openedAt, 5 * 3_600_000);
    at(NOW + 60_000); // a message a minute later must not extend the block
    expect(resetsIn(openedAt, 5 * 3_600_000)).not.toBe(before);
    expect(resetsIn(openedAt, 5 * 3_600_000)).toBe("1h 59m");
  });

  it("reports long windows in days, not 167 hours", () => {
    at(NOW);
    const openedAt = NOW - 4 * 60_000; // weekly block opened 4 minutes ago
    expect(resetsIn(openedAt, 7 * 24 * 3_600_000)).toBe("6d 23h");
  });

  it("drops the hour part under an hour, and goes quiet once expired", () => {
    at(NOW);
    expect(resetsIn(NOW - 4 * 3_600_000 - 30 * 60_000, 5 * 3_600_000)).toBe("30m");
    expect(resetsIn(NOW - 6 * 3_600_000, 5 * 3_600_000)).toBeNull();
    expect(resetsIn(0, 5 * 3_600_000)).toBeNull();
  });
});
