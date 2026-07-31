// Voice's renderer surface: the push-to-talk hotkeys, the mic button, and
// the Tauri/WebAudio adapters that implement Voice's ports. The app supplies
// only a host (see ./host) — no voice logic lives outside this package.
export { default as VoiceButton } from './VoiceButton.js';
export { default as VoiceHotkeys } from './VoiceHotkeys.js';
export { setVoiceHost, type VoiceHost } from './host.js';
export {
  TauriWhisperEngine, BrowserAudioRecorder,
  whisperStatus, whisperInstall, isVoiceReady, cleanTranscript,
} from './voiceAdapters.js';
