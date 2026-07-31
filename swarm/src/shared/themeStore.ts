import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyTheme,
  DEFAULT_THEME_ID,
  type ThemeId,
  THEME_BY_ID,
} from "@/shared/themes";

interface ThemeState {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
}

/**
 * v1 shipped eight themes; v2 has three. Anyone upgrading has a saved id like
 * "dracula" that no longer exists. Without this the store would keep serving
 * that dead id while the DOM showed the default — picker and actual colours
 * would disagree, and every future write would carry the bad value forward.
 */
export function migrateThemeState(persisted: unknown): { themeId: ThemeId } {
  const s = persisted as { themeId?: string } | undefined;
  const id = s?.themeId;
  return { themeId: (id && id in THEME_BY_ID ? id : DEFAULT_THEME_ID) as ThemeId };
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      setThemeId: (id) => {
        if (!THEME_BY_ID[id]) return;
        applyTheme(id);
        set({ themeId: id });
      },
    }),
    {
      name: "swarm-theme",
      version: 2,
      /**
       * v1 shipped eight themes; v2 has three. Anyone upgrading has a saved id
       * like "dracula" that no longer exists. Without this the store would keep
       * serving that dead id while the DOM showed the default — the picker and
       * the actual colours would disagree, and every future write would carry
       * the bad value forward.
       */
      migrate: migrateThemeState as never,
      onRehydrateStorage: () => (state) => {
        // Belt and braces: migrate() only runs when the stored version differs,
        // so guard here too for state written by a build with no version set.
        const id = state?.themeId;
        const safe = id && THEME_BY_ID[id] ? id : DEFAULT_THEME_ID;
        if (state && safe !== state.themeId) state.themeId = safe;
        applyTheme(safe);
      },
    },
  ),
);

/** Call once at app boot so the first paint uses the saved theme. */
export function initTheme(): void {
  const id = useThemeStore.getState().themeId;
  applyTheme(id);
}
