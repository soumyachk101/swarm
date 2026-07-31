"use client";

import { useEffect, useState } from "react";
import {
  Smartphone, Plus, Play, Square, Trash2, RefreshCw, Lock, AlertTriangle, Loader2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { PANE_HEADER_CLASS } from "@swarm/board";
import { useEmulatorStore } from "../emulatorStore";
import AvdBuildDialog from "./AvdBuildDialog";

/**
 * Android emulator surface: build/boot/stop AVDs.
 *
 * The live screen is not wired yet — that's the scrcpy H.264 pipeline (server
 * jar pushed over adb, frames read in Rust, decoded with WebCodecs). Until then
 * this manages devices and says so plainly rather than faking a viewport.
 */
export default function AndroidEmulatorPane() {
  const { sdk, devices, loading, error, refresh, refreshDevices } = useEmulatorStore();
  const [building, setBuilding] = useState(false);
  const [busyAvd, setBusyAvd] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => { refresh(); }, [refresh]);

  // Booting is async and adb only reports the device once it appears.
  useEffect(() => {
    refreshDevices();
    const t = setInterval(refreshDevices, 3000);
    return () => clearInterval(t);
  }, [refreshDevices]);

  const booted = new Set(devices.filter((d) => d.state === "device").map((d) => d.serial));
  const anyDeviceUp = devices.length > 0;

  const start = async (name: string) => {
    setBusyAvd(name);
    setActionError(null);
    try {
      await invoke("start_emulator", { name });
      // Boot takes ~20-40s; the poll above will surface it.
      setTimeout(() => setBusyAvd(null), 4000);
    } catch (e: any) {
      setActionError(String(e?.message ?? e));
      setBusyAvd(null);
    }
  };

  const stop = async (serial: string) => {
    try {
      await invoke("stop_emulator", { serial });
      await refreshDevices();
    } catch (e: any) {
      setActionError(String(e?.message ?? e));
    }
  };

  const remove = async (name: string) => {
    try {
      await invoke("delete_avd", { name });
      await refresh();
    } catch (e: any) {
      setActionError(String(e?.message ?? e));
    }
  };

  /* ── SDK missing: say exactly what's wrong ─────────────────── */
  if (!loading && sdk && !sdk.sdkPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Smartphone className="size-5 text-swarm-textMuted/50" />
        <p className="text-mini font-medium text-swarm-err">Android SDK not found</p>
        <p className="max-w-[400px] text-micro leading-[1.5] text-swarm-textMuted">
          Install Android Studio, or set <code className="text-swarm-gold">ANDROID_HOME</code> to
          an existing SDK. Swarm needs the <code className="text-swarm-gold">emulator</code> and{" "}
          <code className="text-swarm-gold">platform-tools</code> packages.
        </p>
        <button onClick={refresh} className="mt-1 rounded-md border border-swarm-gold/30 bg-swarm-gold/10 px-2.5 py-1 text-micro text-swarm-goldHi hover:bg-swarm-gold/20">
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col glass-body">
      {/* Toolbar — same surface as other panes (no class-tinted wash). */}
      <div data-pane-drag data-pane-header="true" className={`${PANE_HEADER_CLASS} gap-1.5`}>
        <Smartphone className="size-3 shrink-0 text-swarm-textMuted" />
        <span className="text-mini font-medium text-swarm-text">Android</span>
        <span className="text-micro text-swarm-textMuted">
          {sdk ? `${sdk.avds.length} built · ${devices.length} running` : "…"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => { refresh(); refreshDevices(); }}
            className="rounded p-0.5 text-swarm-textMuted transition-colors hover:bg-swarm-border/50 hover:text-swarm-text"
            title="Refresh"
          >
            <RefreshCw className="size-3" />
          </button>
          <button
            onClick={() => setBuilding(true)}
            disabled={!sdk?.sdkPath}
            className="flex items-center gap-1 rounded border border-swarm-border/50 bg-swarm-border/20 px-1.5 py-0.5 text-micro text-swarm-textDim transition-colors hover:bg-swarm-border/40 hover:text-swarm-text disabled:opacity-40"
            title="Build a new emulator"
          >
            <Plus className="size-2.5" />
            Build
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek p-2">
        {loading && !sdk ? (
          <div className="flex h-full items-center justify-center gap-2 text-mini text-swarm-textMuted">
            <Loader2 className="size-3 animate-spin" /> Looking for the Android SDK…
          </div>
        ) : sdk && sdk.avds.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Smartphone className="size-5 text-swarm-textMuted/50" />
            <p className="text-mini font-medium text-swarm-textDim">No emulators yet</p>
            <p className="max-w-[340px] text-micro leading-[1.5] text-swarm-textMuted">
              Build one to test your app. Pick the device, RAM and storage once —
              they're baked in, like a real phone.
            </p>
            <button
              onClick={() => setBuilding(true)}
              className="mt-1 rounded-md border border-swarm-gold/30 bg-swarm-gold/10 px-2.5 py-1 text-micro font-medium text-swarm-goldHi hover:bg-swarm-gold/20"
            >
              Build emulator
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {sdk?.avds.map((name) => {
              // adb serials are emulator-<port>, not the AVD name, so with one
              // emulator up we can only say "something is running".
              const running = anyDeviceUp;
              const serial = devices[0]?.serial;
              return (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-lg border border-swarm-border/40 glass px-2.5 py-2 transition-colors hover:border-swarm-gold/30"
                >
                  <Smartphone className="size-3.5 shrink-0 text-swarm-gold" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-mini font-medium text-swarm-text">{name}</span>
                      <Lock className="size-2.5 shrink-0 text-swarm-textMuted/60" />
                    </div>
                    <span className="text-micro text-swarm-textMuted">
                      {running && booted.has(serial ?? "")
                        ? `running · ${serial}`
                        : running
                        ? `booting · ${serial}`
                        : "stopped"}
                    </span>
                  </div>

                  {running ? (
                    <button
                      onClick={() => serial && stop(serial)}
                      className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-swarm-err/20 hover:text-swarm-err"
                      title="Stop"
                    >
                      <Square className="size-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => start(name)}
                      disabled={busyAvd === name}
                      className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-swarm-gold/20 hover:text-swarm-gold disabled:opacity-40"
                      title="Start"
                    >
                      {busyAvd === name ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                    </button>
                  )}
                  <button
                    onClick={() => remove(name)}
                    disabled={running}
                    className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-swarm-err/20 hover:text-swarm-err disabled:opacity-30"
                    title={running ? "Stop it first" : "Delete"}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              );
            })}

            {/* Honest about the missing piece rather than faking a screen. */}
            <div className="mt-2 flex items-start gap-1.5 rounded-md glass-inset px-2 py-1.5">
              <AlertTriangle className="mt-px size-3 shrink-0 text-swarm-gold/70" />
              <span className="text-micro leading-[1.5] text-swarm-textMuted">
                The emulator opens in its own window for now. The in-pane live
                screen (scrcpy) is the next step.
              </span>
            </div>
          </div>
        )}

        {(actionError || error) && (
          <div className="mt-2 flex items-start gap-1.5 px-1 text-micro text-swarm-err">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span>{actionError ?? error}</span>
          </div>
        )}
      </div>

      {building && sdk && (
        <AvdBuildDialog
          sdk={sdk}
          onClose={() => setBuilding(false)}
          onBuilt={async () => { setBuilding(false); await refresh(); }}
        />
      )}
    </div>
  );
}
