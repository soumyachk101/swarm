/**
 * Turn "open Claude Code with Opus 5 on medium effort" into the flags that CLI
 * actually takes. Every mapping below was read off the installed CLI's --help,
 * not guessed; a CLI with no published flag simply ignores the request rather
 * than being handed something it will reject.
 */

/** Reasoning/effort levels, in the vocabulary Lead speaks. */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

/** Loose spoken model names → the alias the CLI expects. */
function normaliseModel(cli: string, model: string): string {
  const m = model.trim().toLowerCase();
  if (cli === "claude") {
    // Claude Code takes an alias ("opus", "sonnet", "fable") or a full name.
    // "opus 5" / "opus-5" is how people say it; the alias already means latest.
    const alias = m.replace(/\s+/g, "-");
    if (/^(opus|sonnet|haiku|fable)(-\d+(\.\d+)?)?$/.test(alias)) {
      return alias.split("-")[0];
    }
    return model.trim();
  }
  return model.trim();
}

/**
 * Flags that select a model and/or an effort level for one CLI.
 * Unknown CLI, or a CLI without the concept, yields nothing.
 */
export function modelArgs(
  cli: string,
  model?: string,
  effort?: string,
): string[] {
  const args: string[] = [];
  const m = model?.trim() ? normaliseModel(cli, model) : undefined;
  const e = effort?.trim().toLowerCase();
  const validEffort = e && (EFFORT_LEVELS as string[]).includes(e) ? e : undefined;

  switch (cli) {
    case "claude":
      // --model <alias|full-name>, --effort <low|medium|high|xhigh|max>
      if (m) args.push("--model", m);
      if (validEffort) args.push("--effort", validEffort);
      break;

    case "codex":
      // -m/--model, and effort rides on a config override.
      if (m) args.push("--model", m);
      if (validEffort) {
        // Codex tops out at "high"; anything beyond clamps to it.
        const level = validEffort === "xhigh" || validEffort === "max" ? "high" : validEffort;
        args.push("-c", `model_reasoning_effort="${level}"`);
      }
      break;

    case "opencode":
      // Wants provider/model; pass through untouched so the caller stays in
      // control of which provider is meant.
      if (m) args.push("--model", m);
      break;

    case "aider":
      if (m) args.push("--model", m);
      break;

    default:
      // kimi / cursor / kiro / kilo / agy / cline: no stable public flag.
      break;
  }
  return args;
}

/** True when this CLI can be told which model to use. */
export function supportsModel(cli: string): boolean {
  return ["claude", "codex", "opencode", "aider"].includes(cli);
}

/** True when this CLI can be told how hard to think. */
export function supportsEffort(cli: string): boolean {
  return ["claude", "codex"].includes(cli);
}
