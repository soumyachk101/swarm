"use client";

import { useEffect, useRef, useState } from "react";
import { X, Smartphone, Lock, AlertTriangle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  DEVICE_PROFILES, RAM_CHOICES, STORAGE_CHOICES,
  sanitizeAvdName, validateSpec, buildAvdIni, buildConfigIni,
  type AvdSpec, type SystemImage,
} from "./avd";
import type { SdkStatus } from "../emulatorStore";

interface Props {
  sdk: SdkStatus;
  onClose: () => void;
  onBuilt: (name: string) => void;
}

/**
 * Declared at module scope on purpose. As a closure inside the dialog body it
 * was a *new component type* on every render, so React tore down and rebuilt
 * its subtree each keystroke — the Name field lost focus after every single
 * character typed into it.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 shrink-0 pt-1 text-mini text-swarm-textMuted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const chip = (active: boolean) =>
  `rounded-md border px-2 py-1 text-mini transition-colors ${
    active
      ? "border-swarm-gold/50 bg-swarm-gold/15 text-swarm-goldHi"
      : "border-swarm-border/60 text-swarm-textDim hover:border-swarm-gold/30 hover:text-swarm-text"
  }`;

/**
 * Build an emulator. Hardware picked here is permanent — the emulator boots a
 * userdata image sized to these values, so changing them later would mean
 * rebuilding anyway. Same as ordering a real phone.
 */
export default function AvdBuildDialog({ sdk, onClose, onBuilt }: Props) {
  const [displayName, setDisplayName] = useState("My Phone");
  const [device, setDevice] = useState(DEVICE_PROFILES[0]);
  const [image, setImage] = useState<SystemImage | undefined>(
    sdk.images.find((i) => i.playStore) ?? sdk.images[0],
  );
  const [ramMb, setRamMb] = useState<number>(2048);
  const [dataSizeGb, setDataSizeGb] = useState<number>(8);
  const [cores, setCores] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = sanitizeAvdName(displayName);
  const spec: AvdSpec | null = image
    ? { name, displayName: displayName.trim() || name, device, image, ramMb, dataSizeGb, cores }
    : null;
  const errors = spec ? validateSpec(spec, sdk.avds) : ["No system image installed."];
  // The only field the user can actually get wrong is the name, so that is the
  // one that gets marked — outlining nothing left "Build emulator" greyed out
  // with no indication of which control was to blame.
  const nameError = !!spec && errors.length > 0 && /name/i.test(errors[0]);

  const nameRef = useRef<HTMLInputElement>(null);

  // Focus the first field on open and honour Escape. A modal you can only leave
  // by hunting for its × is the sort of thing that reads as a broken app.
  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const build = async () => {
    if (!spec || errors.length || !sdk.sdkPath) return;
    setBusy(true);
    setError(null);
    try {
      await invoke<string>("create_avd", {
        name: spec.name,
        avdIni: buildAvdIni(spec, sdk.avdHome),
        configIni: buildConfigIni(spec, sdk.sdkPath),
      });
      onBuilt(spec.name);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Build an emulator"
        onClick={(e) => e.stopPropagation()}
        // Tall panes are the exception, not the rule: with several system
        // images installed the form outgrew a short pane and the Build button
        // ended up below the fold with no way to scroll to it.
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl glass-hi shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-swarm-border/40 px-3 py-2.5">
          <Smartphone className="size-3.5 text-swarm-gold" />
          <span className="text-xs font-semibold text-swarm-text">Build an emulator</span>
          <button
            onClick={onClose}
            className="ml-auto rounded p-0.5 text-swarm-textMuted transition-colors hover:bg-swarm-border/40 hover:text-swarm-text"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-sleek p-3">
          <Row label="Name">
            <input
              ref={nameRef}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-invalid={nameError}
              className={`w-full rounded-md border glass-inset px-2 py-1 text-mini text-swarm-text outline-none ${
                nameError ? "border-swarm-err/60" : "border-swarm-border/50 focus:border-swarm-gold/40"
              }`}
            />
            {name && name !== displayName.trim() && (
              <span className="mt-0.5 block text-micro text-swarm-textMuted">id: {name}</span>
            )}
          </Row>

          <Row label="Device">
            <div className="flex flex-wrap gap-1">
              {DEVICE_PROFILES.map((d) => (
                <button key={d.id} onClick={() => setDevice(d)} className={chip(device.id === d.id)}>
                  {d.name}
                </button>
              ))}
            </div>
            <span className="mt-1 block text-micro text-swarm-textMuted">
              {device.width}×{device.height} · {device.density} dpi
            </span>
          </Row>

          <Row label="System image">
            {sdk.images.length === 0 ? (
              <span className="text-micro text-swarm-err">
                No system images installed. Add one in Android Studio → SDK Manager.
              </span>
            ) : (
              <div className="flex flex-col gap-1">
                {sdk.images.map((i) => (
                  <button
                    key={`${i.apiDir}/${i.tagDir}/${i.abi}`}
                    onClick={() => setImage(i)}
                    className={`${chip(
                      image?.apiDir === i.apiDir && image?.tagDir === i.tagDir && image?.abi === i.abi,
                    )} text-left`}
                  >
                    {i.label}
                    {i.playStore && (
                      <span className="ml-1 rounded bg-swarm-gold/15 px-1 text-micro text-swarm-gold">
                        Play Store
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Row>

          <Row label="RAM">
            <div className="flex gap-1">
              {RAM_CHOICES.map((r) => (
                <button key={r} onClick={() => setRamMb(r)} className={chip(ramMb === r)}>
                  {r >= 1024 ? `${r / 1024} GB` : `${r} MB`}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Storage">
            <div className="flex gap-1">
              {STORAGE_CHOICES.map((s) => (
                <button key={s} onClick={() => setDataSizeGb(s)} className={chip(dataSizeGb === s)}>
                  {s} GB
                </button>
              ))}
            </div>
          </Row>

          <Row label="CPU cores">
            <div className="flex gap-1">
              {[2, 4, 6, 8].map((c) => (
                <button key={c} onClick={() => setCores(c)} className={chip(cores === c)}>
                  {c}
                </button>
              ))}
            </div>
          </Row>

          <div className="flex items-start gap-1.5 rounded-md border border-swarm-border/40 glass-inset px-2 py-1.5">
            <Lock className="mt-px size-3 shrink-0 text-swarm-gold" />
            <span className="text-micro leading-[1.5] text-swarm-textMuted">
              Hardware is permanent once built — like a real device. To change RAM,
              storage or screen you build a new emulator.
            </span>
          </div>

          {(errors.length > 0 || error) && (
            <div className="flex items-start gap-1.5 text-micro text-swarm-err">
              <AlertTriangle className="mt-px size-3 shrink-0" />
              <span>{error ?? errors[0]}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-swarm-border/40 px-3 py-2">
          <button
            onClick={onClose}
            className="rounded-md px-2.5 py-1 text-mini text-swarm-textDim transition-colors hover:text-swarm-text"
          >
            Cancel
          </button>
          <button
            onClick={build}
            disabled={busy || errors.length > 0 || !sdk.sdkPath}
            // A greyed-out button with no reason attached is the classic dead
            // end; the blocking error rides along as the tooltip.
            title={errors[0] ?? (sdk.sdkPath ? undefined : "Android SDK not found")}
            className="rounded-md border border-swarm-gold/25 bg-swarm-gold/10 px-2.5 py-1 text-mini font-medium text-swarm-goldHi transition-colors hover:bg-swarm-gold/20 disabled:opacity-40"
          >
            {busy ? "Building…" : "Build emulator"}
          </button>
        </div>
      </div>
    </div>
  );
}
