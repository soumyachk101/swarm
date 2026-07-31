import { createJSONStorage } from "zustand/middleware";

// Persisted stores also run under vitest, where there is no localStorage —
// zustand then warns on every set(). Fall back to an in-memory map so tests
// exercise the same code path quietly.
const memory = new Map<string, string>();

export const appStorage = createJSONStorage(() =>
  typeof localStorage !== "undefined"
    ? localStorage
    : {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => void memory.set(k, v),
        removeItem: (k: string) => void memory.delete(k),
      },
);
