import {
  siClaude,
  siCline,
  siCursor,
  siGnubash,
  siKimi,
  siLinux,
  siOpencode,
} from "simple-icons";
import type { Brand } from "./BrandGlyph.js";

/**
 * OpenAI withdrew its mark from simple-icons, so the path is carried here.
 * It is OpenAI's own published logo, unmodified.
 */
const OPENAI_PATH =
  "M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z";

/**
 * PowerShell's mark is a Microsoft trademark and is not redistributable through
 * an icon package, so it is composed from its two defining primitives: the
 * chevron and the underscore, in PowerShell's own blue. Same for the Windows
 * command prompt, whose identity is literally the C:\> prompt.
 */
const POWERSHELL_PATH =
  "M4.6 6.2 10.4 11.6 4.6 17 3.2 15.6 7.6 11.6 3.2 7.6 Z M11.2 15.6 H20 V17.6 H11.2 Z";
const CMD_PATH = "M3.4 7 7.4 11.5 3.4 16 2 14.6 4.8 11.5 2 8.4 Z M9 14.2 H17 V16.2 H9 Z";

const vec = (i: { path: string; hex: string; title: string }): Brand => ({
  kind: "vector",
  path: i.path,
  hex: `#${i.hex}`,
  title: i.title,
});

/**
 * CLI agent id -> its own logo. Keyed by plain string on purpose: Board is
 * the shared UI kit and must not depend on Agents (Agents depends on
 * Board, so the arrow only points one way).
 */
export const CLI_BRANDS: Record<string, Brand> = {
  "claude-code": vec(siClaude),
  "codex-cli": { kind: "vector", path: OPENAI_PATH, hex: "#FFFFFF", title: "OpenAI Codex" },
  opencode: vec(siOpencode),
  "kimi-code": vec(siKimi),
  cline: vec(siCline),
  cursor: vec(siCursor),
  "antigravity-cli": { kind: "raster", asset: "antigravity", title: "Antigravity" },
  kiro: { kind: "raster", asset: "kiro", title: "Kiro" },
  kilo: { kind: "raster", asset: "kilo", title: "Kilo" },
  // Aider publishes no icon font or SVG mark, so it gets a lettermark rather
  // than someone else's logo or a stock robot.
  aider: { kind: "letter", text: "A", title: "Aider" },
};

/** Shell id -> its own logo. Same keying rule as CLI_BRANDS. */
export const SHELL_BRANDS: Record<string, Brand> = {
  powershell: { kind: "vector", path: POWERSHELL_PATH, hex: "#5391FE", title: "PowerShell" },
  cmd: { kind: "vector", path: CMD_PATH, hex: "#C7C7C7", title: "Command Prompt" },
  "git-bash": vec(siGnubash),
  wsl: vec(siLinux),
};

export function cliBrand(id: string | undefined | null): Brand | undefined {
  return id ? CLI_BRANDS[id] : undefined;
}

export function shellBrand(id: string | undefined | null): Brand | undefined {
  return id ? SHELL_BRANDS[id] : undefined;
}
