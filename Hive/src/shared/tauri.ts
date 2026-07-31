import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface TauriAPIs {
  invoke: typeof invoke;
  open: typeof open;
  save: typeof save;
  getCurrentWindow: typeof getCurrentWindow;
}

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
};

const apis: TauriAPIs = {
  invoke,
  open: open as any,
  save,
  getCurrentWindow,
};

export const getTauriAPIs = (): TauriAPIs | null => {
  if (!isTauri()) return null;
  return apis;
};

export const loadTauriAPIs = async (): Promise<TauriAPIs | null> => {
  if (!isTauri()) return null;
  return apis;
};
