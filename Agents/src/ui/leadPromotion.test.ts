import { describe, it, expect, beforeEach } from "vitest";
import { useAgentsStore, type Agent } from "./agentsStore.js";

const swarm = (id: string, workspaceId: string, extra: Partial<Agent> = {}): Agent => ({
  id, cli: "claude", cliName: "claude", workspaceId, ...extra,
});

// Two workspaces, i.e. two folders open at once.
const WS_A = "ws-a";
const WS_B = "ws-b";

describe("Lead promotion", () => {
  beforeEach(() => {
    useAgentsStore.setState({
      agents: [
        swarm("a1", WS_A),
        swarm("a2", WS_A),
        swarm("term", WS_A, { kind: "shell", cli: "shell", cliName: "Terminal" }),
        swarm("b1", WS_B),
      ],
      agentStatuses: {},
      maximizedPane: null,
    });
  });

  const lead = (ws: string) => useAgentsStore.getState().leadOf(ws);

  it("crowns a Agent and defaults it to Steward", () => {
    expect(useAgentsStore.getState().promoteToLead("a1")).toBe(true);
    expect(lead(WS_A)?.id).toBe("a1");
    expect(lead(WS_A)?.leadMode).toBe("Steward");
  });

  it("refuses a second Lead in the same agent until the first is demoted", () => {
    useAgentsStore.getState().promoteToLead("a1");
    expect(useAgentsStore.getState().promoteToLead("a2")).toBe(false);
    expect(lead(WS_A)?.id).toBe("a1");

    useAgentsStore.getState().demoteLead(WS_A);
    expect(useAgentsStore.getState().promoteToLead("a2")).toBe(true);
    expect(lead(WS_A)?.id).toBe("a2");
  });

  it("lets every folder crown its own lead", () => {
    expect(useAgentsStore.getState().promoteToLead("a1")).toBe(true);
    expect(useAgentsStore.getState().promoteToLead("b1")).toBe(true);
    expect(lead(WS_A)?.id).toBe("a1");
    expect(lead(WS_B)?.id).toBe("b1");
  });

  it("demoting one folder's lead leaves the other's crowned", () => {
    useAgentsStore.getState().promoteToLead("a1");
    useAgentsStore.getState().promoteToLead("b1");
    useAgentsStore.getState().demoteLead(WS_A);
    expect(lead(WS_A)).toBeUndefined();
    expect(lead(WS_B)?.id).toBe("b1");
  });

  it("frees the crown when the Lead is removed", () => {
    useAgentsStore.getState().promoteToLead("a1");
    useAgentsStore.getState().removeAgent("a1");
    expect(lead(WS_A)).toBeUndefined();
    expect(useAgentsStore.getState().promoteToLead("a2")).toBe(true);
  });

  it("only crowns CLI agents", () => {
    expect(useAgentsStore.getState().promoteToLead("term")).toBe(false);
    expect(lead(WS_A)).toBeUndefined();
  });

  it("stores the selected mode on the Lead", () => {
    useAgentsStore.getState().promoteToLead("a1");
    useAgentsStore.getState().setLeadMode("a1", "Stinger");
    expect(lead(WS_A)?.leadMode).toBe("Stinger");
  });

  it("swarmsOf keeps each folder's panes apart", () => {
    expect(useAgentsStore.getState().swarmsOf(WS_A).map((b) => b.id)).toEqual(["a1", "a2", "term"]);
    expect(useAgentsStore.getState().swarmsOf(WS_B).map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("agent extensions in the swarm", () => {
  const ext = (id: string, agentExt: boolean): Agent => ({
    id, cli: "openvsx", cliName: "Claude Code", kind: "openvsx",
    workspaceId: WS_A, agentExt,
  });

  it("crowns an agent extension pane, but never a tool extension", () => {
    useAgentsStore.setState({
      agents: [ext("claude-ext", true), ext("gitlens", false)],
      agentStatuses: {},
      maximizedPane: null,
    });
    expect(useAgentsStore.getState().promoteToLead("gitlens")).toBe(false);
    expect(useAgentsStore.getState().promoteToLead("claude-ext")).toBe(true);
    expect(useAgentsStore.getState().leadOf(WS_A)?.id).toBe("claude-ext");
  });

  it("still allows only one crown per agent, CLI or extension", () => {
    useAgentsStore.setState({
      agents: [swarm("a1", WS_A), ext("claude-ext", true)],
      agentStatuses: {},
      maximizedPane: null,
    });
    expect(useAgentsStore.getState().promoteToLead("claude-ext")).toBe(true);
    expect(useAgentsStore.getState().promoteToLead("a1")).toBe(false);
  });
});
