// Voice's UI needs two things only the app knows: where the Lead is, and
// how to show it. The app registers them once at boot; Voice never imports
// app stores, so it stays a standalone package.
export interface VoiceHost {
  /** Deliver dictated text to the current Lead (no trailing Enter). */
  deliverToLead(text: string): void;
  /** Bring the Lead into view before dictating into it. */
  revealLead(): void;
}

let host: VoiceHost = {
  deliverToLead: () => console.warn("[Voice] no host registered — dictation dropped"),
  revealLead: () => {},
};

export function setVoiceHost(next: VoiceHost): void {
  host = next;
}

export function swarmVoiceHost(): VoiceHost {
  return host;
}
