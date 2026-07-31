// BeeVoice's UI needs two things only the app knows: where the QueenBee is, and
// how to show it. The app registers them once at boot; BeeVoice never imports
// app stores, so it stays a standalone package.
export interface BeeVoiceHost {
  /** Deliver dictated text to the current QueenBee (no trailing Enter). */
  deliverToQueen(text: string): void;
  /** Bring the QueenBee into view before dictating into it. */
  revealQueen(): void;
}

let host: BeeVoiceHost = {
  deliverToQueen: () => console.warn("[BeeVoice] no host registered — dictation dropped"),
  revealQueen: () => {},
};

export function setBeeVoiceHost(next: BeeVoiceHost): void {
  host = next;
}

export function beeVoiceHost(): BeeVoiceHost {
  return host;
}
