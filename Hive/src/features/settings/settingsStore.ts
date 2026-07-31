import { create } from "zustand";
import { envForCli, type ApiKeys } from "@hiveory/worker-bees/cli-configs";
import { persist } from "zustand/middleware";


interface SettingsState {
  apiKeys: ApiKeys;
  setApiKey: (provider: keyof ApiKeys, value: string) => void;
  autosaveEnabled: boolean;
  setAutosaveEnabled: (enabled: boolean) => void;
  autosaveInterval: number;
  setAutosaveInterval: (interval: number) => void;
  defaultWorkerBee: string;
  setDefaultWorkerBee: (cli: string) => void;
  nectarTokenBudget: number;
  setNectarTokenBudget: (budget: number) => void;
  queenbeeProvider: string;
  setQueenbeeProvider: (provider: string) => void;
  queenbeeModel: string;
  setQueenbeeModel: (model: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKeys: { anthropic: "", openai: "", google: "", openrouter: "", moonshot: "" },
      setApiKey: (provider, value) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: value },
        })),
      autosaveEnabled: true,
      setAutosaveEnabled: (enabled) => set({ autosaveEnabled: enabled }),
      autosaveInterval: 30000, // 30 seconds default
      setAutosaveInterval: (interval) => set({ autosaveInterval: interval }),
      defaultWorkerBee: "claude",
      setDefaultWorkerBee: (cli) => set({ defaultWorkerBee: cli }),
      nectarTokenBudget: 4000,
      setNectarTokenBudget: (budget) => set({ nectarTokenBudget: budget }),
      queenbeeProvider: "openrouter",
      setQueenbeeProvider: (provider) => set({ queenbeeProvider: provider }),
      queenbeeModel: "openai/gpt-4o-mini",
      setQueenbeeModel: (model) => set({ queenbeeModel: model }),
    }),
    { name: "hiveory-settings" },
  ),
);

// Re-exported so app code keeps one import site for settings-shaped things.
export { envForCli };
export type { ApiKeys };
