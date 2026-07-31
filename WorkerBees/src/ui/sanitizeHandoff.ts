/**
 * Strip TUI / PTY noise from session transcripts before they land in handoffs
 * or (for stdin-fallback CLIs) get mentioned to the agent.
 *
 * Raw ConPTY captures include Ink/alt-screen garbage, braille/block spinner
 * glyphs, and glued UI chrome ("forshortcuts…") — dumping that into the next
 * Claude Code prompt produces the garbled "weird strings" the user saw.
 */

const ANSI_RE = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007]*\u0007|\u001b[()].|\u001b./g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** Braille/block/box-drawing spinner & checkerboard glyphs common in CLI TUIs. */
const TUI_GLYPH_RE = /[\u2800-\u28FF\u2580-\u259F\u2500-\u257F\u25A0-\u25FF]+/g;
/** Glued Ink status chrome that survived whitespace collapse. */
const GLUED_UI_RE =
  /forshortcuts\S*|ctrl\+[a-z]\s+to\s+\w+|shift\+tab\s+to\s+cycle|bypass permissions on|←\s*for agents|❯|›/gi;

export function stripTerminalNoise(text: string): string {
  return text
    .replace(ANSI_RE, "")
    .replace(CONTROL_RE, "")
    .replace(TUI_GLYPH_RE, " ")
    .replace(GLUED_UI_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** True when a handoff excerpt is mostly UI chrome / unreadable — do not inject. */
export function looksLikeTerminalGarbage(text: string): boolean {
  const cleaned = stripTerminalNoise(text);
  if (cleaned.length < 40) return true;
  const printable = cleaned.replace(/[^\x20-\x7E\n]/g, "");
  if (printable.length / Math.max(cleaned.length, 1) < 0.55) return true;
  // Repeated sticky tokens from prior TUI captures.
  if ((cleaned.match(/AntigravityCLI|Gemini3\.|forshortcuts/gi) || []).length >= 2) return true;
  return false;
}

/** Keep only lines that look like real session notes, not chrome. */
export function excerptForHandoff(transcript: string, maxChars = 1200): string {
  const lines = transcript
    .split(/\r?\n/)
    .map((l) => stripTerminalNoise(l))
    .filter((l) => l.length > 2)
    .filter((l) => !/^[─═━\-=\s·•]{4,}$/.test(l))
    .filter((l) => !looksLikeTerminalGarbage(l) || l.length > 80);

  const joined = lines.join("\n").slice(-maxChars).replace(/`/g, "'");
  if (looksLikeTerminalGarbage(joined)) return "";
  return joined;
}
