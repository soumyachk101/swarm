"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, Download } from "lucide-react";
import { Voice } from "../core.js";
import {
  TauriWhisperEngine, BrowserAudioRecorder,
  whisperStatus, whisperInstall, isVoiceReady, cleanTranscript,
} from "./voiceAdapters.js";

// One model everywhere: the engine transcribes with it, and we install it.
const MODEL = "base.en" as const;

type State = "checking" | "needs-install" | "installing" | "idle" | "recording" | "transcribing";

/**
 * Mic button that dictates into Lead. If whisper.cpp isn't present it
 * offers a one-click install (downloads the binary + a small model into the
 * shared swarm-voice cache), then records → transcribes via Voice.
 */
export default function VoiceButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const recRef = useRef<BrowserAudioRecorder | null>(null);

  const voice = () => {
    if (!voiceRef.current) {
      recRef.current = new BrowserAudioRecorder();
      voiceRef.current = new Voice({
        engine: new TauriWhisperEngine(),
        recorder: recRef.current,
        modelSize: MODEL,
      });
    }
    return voiceRef.current;
  };

  useEffect(() => {
    whisperStatus()
      .then((s) => setState(isVoiceReady(s) ? "idle" : "needs-install"))
      .catch(() => setState("needs-install"));
  }, []);

  const install = async () => {
    setError(null);
    setState("installing");
    try {
      const s = await whisperInstall(MODEL);
      setState(isVoiceReady(s) ? "idle" : "needs-install");
      if (!isVoiceReady(s)) setError("Install finished but voice still isn't ready.");
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setState("needs-install");
    }
  };

  const start = async () => {
    setError(null);
    try {
      voice();
      await recRef.current!.startRecording();
      setState("recording");
    } catch (e: any) {
      setError(String(e?.message ?? e).includes("Permission") ? "Microphone permission denied." : String(e?.message ?? e));
    }
  };

  const stop = async () => {
    setState("transcribing");
    try {
      const path = await recRef.current!.stopRecording();
      const text = cleanTranscript(await voice().voiceCommandTranscribe(path));
      if (text) onTranscript(text);
      else setError("Didn't catch that — try again.");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setState("idle");
    }
  };

  const onClick = () => {
    if (state === "needs-install") return install();
    if (state === "idle") return start();
    if (state === "recording") return stop();
  };

  const busy = state === "checking" || state === "installing" || state === "transcribing";
  const Icon =
    state === "needs-install" ? Download
    : busy ? Loader2
    : Mic;

  const title =
    error ??
    (state === "needs-install" ? "Install voice (~150 MB, one time)"
    : state === "installing" ? "Installing voice engine…"
    : state === "transcribing" ? "Transcribing…"
    : state === "recording" ? "Stop & transcribe"
    : "Dictate to Lead");

  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={busy}
        title={title}
        className={`flex size-7 items-center justify-center rounded-md transition-colors ${
          state === "recording"
            ? "bg-swarm-err/20 text-swarm-err animate-pulse"
            : error
            ? "text-swarm-err hover:bg-swarm-border/40"
            : "text-swarm-textMuted hover:bg-swarm-border/40 hover:text-swarm-gold"
        }`}
      >
        <Icon className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
      </button>
      {(error || state === "installing") && (
        <div className="absolute bottom-full right-0 mb-1 w-56 rounded-md glass-hi px-2 py-1.5 text-micro leading-[1.4] text-swarm-textMuted shadow-lg">
          {error ?? "Downloading whisper.cpp + model… this runs once."}
        </div>
      )}
    </div>
  );
}
