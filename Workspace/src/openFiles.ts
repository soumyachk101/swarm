import { create } from 'zustand';

const MAX_OPEN_FILES = 40;

// Open-file tracking is per folder: with several folders open at once, a hint
// built for one project must never leak the other's paths. There is no global
// "current project" here — that lives on the active agent's binding
// (see useActiveProjectPath in features/workspaces/agentStore).
interface ProjectState {
  openFiles: Record<string, string[]>;
  /** Track a file opened in Explorer/Search/Git viewers, under its folder. */
  addOpenFile: (folder: string | null | undefined, file: string) => void;
  openFilesFor: (folder: string | null | undefined) => string[];
  activeFile: string | null;
  setActiveFile: (file: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  openFiles: {},
  addOpenFile: (folder, file) =>
    set((state) => {
      const normalized = file.trim();
      if (!normalized || !folder) return state;
      const rest = (state.openFiles[folder] ?? []).filter((f) => f !== normalized);
      return {
        openFiles: {
          ...state.openFiles,
          [folder]: [normalized, ...rest].slice(0, MAX_OPEN_FILES),
        },
        activeFile: normalized,
      };
    }),
  openFilesFor: (folder) => (folder ? get().openFiles[folder] ?? [] : []),
  activeFile: null,
  setActiveFile: (file) => set({ activeFile: file }),
}));
