/**
 * The extensions Swarm offers — a curated shelf, not the whole Open-VSX
 * registry. Everything here is either an AI coding agent (which can join the
 * swarm as a Agent and be crowned Lead) or a development tool that earns
 * its place in a pane.
 *
 * Ids are the real Open-VSX ids (`namespace.name`) and are what
 * `openvscode-server --install-extension` receives.
 */
export type ExtensionRole = "agent" | "tool";

export interface CatalogEntry {
  id: string;
  name: string;
  publisher: string;
  description: string;
  role: ExtensionRole;
}

export const EXTENSION_CATALOG: CatalogEntry[] = [
  // ── Agents: these panes behave like Agents and can wear the crown ──
  {
    id: "Anthropic.claude-code",
    name: "Claude Code",
    publisher: "Anthropic",
    description: "Anthropic's agentic coder, in the editor. Plans, edits and runs your code.",
    role: "agent",
  },
  {
    id: "kilocode.kilo-code",
    name: "Kilo Code",
    publisher: "kilocode",
    description: "Open-source AI coding agent with autocomplete and multi-file edits.",
    role: "agent",
  },
  {
    id: "FedaykinDev.openchamber",
    name: "OpenChamber",
    publisher: "FedaykinDev",
    description: "Open agent workbench for running and steering coding agents.",
    role: "agent",
  },

  // ── Tools: ordinary editor panes, no crown ──
  {
    id: "Postman.postman-for-vscode",
    name: "Postman",
    publisher: "Postman",
    description: "Send API requests and manage collections without leaving the swarm.",
    role: "tool",
  },
  {
    id: "eamodio.gitlens",
    name: "GitLens",
    publisher: "eamodio",
    description: "Blame, history and diffs inline — see who changed what and why.",
    role: "tool",
  },
];

export const AGENT_EXTENSIONS = EXTENSION_CATALOG.filter((e) => e.role === "agent");

/** True when this extension id is one of the agents that can be crowned. */
export function isAgentExtension(id: string | undefined): boolean {
  return !!id && AGENT_EXTENSIONS.some((e) => e.id === id);
}
