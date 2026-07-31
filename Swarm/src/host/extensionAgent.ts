import { useAgentsStore, type Agent } from "@swarm/agents/ui";

// An agent extension (Claude Code, Kilo Code, OpenChamber) is a Agent that
// happens to run inside an editor pane rather than a pty. Swarm is the only place
// that knows both packages, so the crown wiring and the lead env live here.
//
// The env is what makes a crowned extension a real Lead: openvscode-server
// inherits it, the agent extension spawns its MCP servers as children, and the
// pheromone-mcp server advertises Lead's tools exactly as it does for a CLI.
export function extensionAgentProps(swarm: Agent, swarms: Agent[]) {
  if (!swarm.agentExt) return {};
  const lead = swarms.find((b) => b.isLead && b.workspaceId === swarm.workspaceId);
  const isLead = lead?.id === swarm.id;
  const env: Record<string, string> = { SWARM_PANE_ID: swarm.id };
  if (isLead) env.SWARM_LEAD = "1";
  return {
    env,
    crown: {
      isLead,
      taken: !!lead && !isLead,
      onToggle: () => {
        const s = useAgentsStore.getState();
        if (isLead) s.demoteLead(swarm.workspaceId ?? "");
        else s.promoteToLead(swarm.id);
      },
    },
  };
}
