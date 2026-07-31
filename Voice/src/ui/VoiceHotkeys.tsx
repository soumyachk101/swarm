"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { Voice } from "../core.js";
import {
  TauriWhisperEngine, BrowserAudioRecorder,
  whisperStatus, isVoiceReady, cleanTranscript,
} from "./voiceAdapters.js";
import { swarmVoiceHost } from "./host.js";

const MODEL = "base.en" as const;
type Mode = "anywhere" | "lead";

/**
 * In-app push-to-talk. Handled with window keyboard events (NOT a global OS
 * listener) so it only fires while Swarm is focused and stops the instant the
 * app loses focus or closes.
 *
 *   Ctrl+Win → dictate into the focused text field (a URL bar, a rename…).
 *   Win+Alt  → dictate into the Lead chat box.
 *
 * Hold the combo, speak, release.
 */
export default function VoiceHotkeys() {
  const [phase, setPhase] = useState<null | { mode: Mode; busy: boolean }>(null);
  const recRef = useRef<BrowserAudioRecorder | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const recording = useRef(false);
  const activeMode = useRef<Mode | null>(null);
  const pressed = useRef<Set<string>>(new Set());

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
    const modeFor = (): Mode | null => {
      const p = pressed.current;
      const ctrl = p.has("ControlLeft") || p.has("ControlRight");
      const meta = p.has("MetaLeft") || p.has("MetaRight");
      const alt = p.has("AltLeft") || p.has("AltRight");
      if (ctrl && meta && !alt) return "anywhere";
      if (meta && alt && !ctrl) return "lead";
      return null;
    };

    const startIfReady = async (mode: Mode) => {
      if (recording.current) return;
      const s = await whisperStatus().catch(() => null);
      if (!s || !isVoiceReady(s)) return; // not installed → ignore
      // Combo may have released during the async status check.
      if (modeFor() !== mode) return;
      try {
        voice();
        await recRef.current!.startRecording();
        recording.current = true;
        activeMode.current = mode;
        setPhase({ mode, busy: false });
      } catch { /* mic denied */ }
    };

    const finish = async () => {
      if (!recording.current) return;
      const mode = activeMode.current!;
      recording.current = false;
      activeMode.current = null;
      setPhase({ mode, busy: true });
      try {
        const path = await recRef.current!.stopRecording();
        const text = cleanTranscript(await voice().voiceCommandTranscribe(path));
        if (text) deliver(mode, text);
      } catch { /* transcription failed */ } finally {
        setPhase(null);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      pressed.current.add(e.code);
      const mode = modeFor();
      if (mode && !recording.current) {
        e.preventDefault();
        startIfReady(mode);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressed.current.delete(e.code);
      // Combo broken → finish the utterance.
      if (recording.current && modeFor() === null) finish();
    };
    const onBlur = () => {
      // Losing focus mid-combo: clear keys and stop, so nothing lingers.
      pressed.current.clear();
      if (recording.current) finish();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!phase) return null;
  return (
    <div className="fixed bottom-8 left-1/2 z-[200] -translate-x-1/2 flex items-center gap-2 rounded-full border border-swarm-gold/40 glass-hi px-3.5 py-1.5 text-mini font-medium text-swarm-goldHi shadow-xl backdrop-blur">
      {phase.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mic className="size-3.5 animate-pulse" />}
      {phase.busy ? "Transcribing…" : phase.mode === "anywhere" ? "Listening — dictate to field" : "Listening — Lead"}
    </div>
  );
}

/** Route text to the focused field (anywhere) or the Lead box. */
function deliver(mode: Mode, text: string) {
  if (mode === "lead") {
    typeIntoLead(text);
    return;
  }
  // anywhere: the focused field; fall back to Lead if nothing's focused.
  const el = document.activeElement as HTMLElement | null;
  if (!insertIntoElement(el, text)) typeIntoLead(text);
}

/** Type into the Lead's CLI, revealing it first so the user sees it land.
 *  No trailing Enter — the transcript waits at the prompt for review. */
function typeIntoLead(text: string) {
  swarmVoiceHost().revealLead();
  swarmVoiceHost().deliverToLead(text);
}

/** Insert text at the caret of an input/textarea (React-safe). */
function insertIntoElement(el: HTMLElement | null, text: string): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setter?.call(el, next);
    // Fire a native input event so React's controlled state updates.
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    return true;
  }
  if (el?.isContentEditable) {
    document.execCommand("insertText", false, text);
    return true;
  }
  return false;
}
