// Which provider key each CLI agent expects in its environment. This is CLI
// knowledge, so it lives with the rest of the per-CLI config rather than in the
// app's settings store — the store just supplies the key values.
export interface ApiKeys {
  anthropic: string;
  openai: string;
  google: string;
  openrouter: string;
  moonshot: string; // For Kimi Code
}

// Maps a CLI's real executable name to the env vars it needs to authenticate.
// Aider supports both Anthropic and OpenAI models, so it gets both keys.
export function envForCli(command: string, apiKeys: ApiKeys): Record<string, string> {
  const env: Record<string, string> = {};
  switch (command) {
    case "claude":
      if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic;
      break;
    case "codex":
      if (apiKeys.openai) env.OPENAI_API_KEY = apiKeys.openai;
      break;
    case "agy":
      if (apiKeys.google) {
        env.GEMINI_API_KEY = apiKeys.google;
        env.GOOGLE_API_KEY = apiKeys.google;
      }
      break;
    case "aider":
      if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic;
      if (apiKeys.openai) env.OPENAI_API_KEY = apiKeys.openai;
      break;
    case "opencode":
      if (apiKeys.openrouter) env.OPENROUTER_API_KEY = apiKeys.openrouter;
      if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic;
      break;
    case "kimi":
      if (apiKeys.moonshot) env.MOONSHOT_API_KEY = apiKeys.moonshot;
      break;
    case "cline":
      if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic;
      if (apiKeys.openrouter) env.OPENROUTER_API_KEY = apiKeys.openrouter;
      break;
    case "cursor":
    case "kiro":
    case "kilo":
      if (apiKeys.openai) env.OPENAI_API_KEY = apiKeys.openai;
      if (apiKeys.anthropic) env.ANTHROPIC_API_KEY = apiKeys.anthropic;
      if (apiKeys.openrouter) env.OPENROUTER_API_KEY = apiKeys.openrouter;
      break;
  }
  return env;
}
