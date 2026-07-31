import { describe, it, expect, beforeEach } from "vitest";
import { useWorkerBeesStore, type WorkerBee } from "./workerBeesStore.js";

const bee = (id: string, workHiveId: string, extra: Partial<WorkerBee> = {}): WorkerBee => ({
  id, cli: "claude", cliName: "claude", workHiveId, ...extra,
});

// Two workHives, i.e. two folders open at once.
const WS_A = "ws-a";
const WS_B = "ws-b";

describe("QueenBee promotion", () => {
  beforeEach(() => {
    useWorkerBeesStore.setState({
      workerBees: [
        bee("a1", WS_A),
        bee("a2", WS_A),
        bee("term", WS_A, { kind: "shell", cli: "shell", cliName: "Terminal" }),
        bee("b1", WS_B),
      ],
      agentStatuses: {},
      maximizedPane: null,
    });
  });

  const queen = (ws: string) => useWorkerBeesStore.getState().queenOf(ws);

  it("crowns a WorkerBee and defaults it to Steward", () => {
    expect(useWorkerBeesStore.getState().promoteToQueen("a1")).toBe(true);
    expect(queen(WS_A)?.id).toBe("a1");
    expect(queen(WS_A)?.queenMode).toBe("Steward");
  });

  it("refuses a second QueenBee in the same workhive until the first is demoted", () => {
    useWorkerBeesStore.getState().promoteToQueen("a1");
    expect(useWorkerBeesStore.getState().promoteToQueen("a2")).toBe(false);
    expect(queen(WS_A)?.id).toBe("a1");

    useWorkerBeesStore.getState().demoteQueen(WS_A);
    expect(useWorkerBeesStore.getState().promoteToQueen("a2")).toBe(true);
    expect(queen(WS_A)?.id).toBe("a2");
  });

  it("lets every folder crown its own queen", () => {
    expect(useWorkerBeesStore.getState().promoteToQueen("a1")).toBe(true);
    expect(useWorkerBeesStore.getState().promoteToQueen("b1")).toBe(true);
    expect(queen(WS_A)?.id).toBe("a1");
    expect(queen(WS_B)?.id).toBe("b1");
  });

  it("demoting one folder's queen leaves the other's crowned", () => {
    useWorkerBeesStore.getState().promoteToQueen("a1");
    useWorkerBeesStore.getState().promoteToQueen("b1");
    useWorkerBeesStore.getState().demoteQueen(WS_A);
    expect(queen(WS_A)).toBeUndefined();
    expect(queen(WS_B)?.id).toBe("b1");
  });

  it("frees the crown when the QueenBee is removed", () => {
    useWorkerBeesStore.getState().promoteToQueen("a1");
    useWorkerBeesStore.getState().removeWorkerBee("a1");
    expect(queen(WS_A)).toBeUndefined();
    expect(useWorkerBeesStore.getState().promoteToQueen("a2")).toBe(true);
  });

  it("only crowns CLI agents", () => {
    expect(useWorkerBeesStore.getState().promoteToQueen("term")).toBe(false);
    expect(queen(WS_A)).toBeUndefined();
  });

  it("stores the selected mode on the QueenBee", () => {
    useWorkerBeesStore.getState().promoteToQueen("a1");
    useWorkerBeesStore.getState().setQueenMode("a1", "Stinger");
    expect(queen(WS_A)?.queenMode).toBe("Stinger");
  });

  it("beesOf keeps each folder's panes apart", () => {
    expect(useWorkerBeesStore.getState().beesOf(WS_A).map((b) => b.id)).toEqual(["a1", "a2", "term"]);
    expect(useWorkerBeesStore.getState().beesOf(WS_B).map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("agent extensions in the hive", () => {
  const ext = (id: string, agentExt: boolean): WorkerBee => ({
    id, cli: "openvsx", cliName: "Claude Code", kind: "openvsx",
    workHiveId: WS_A, agentExt,
  });

  it("crowns an agent extension pane, but never a tool extension", () => {
    useWorkerBeesStore.setState({
      workerBees: [ext("claude-ext", true), ext("gitlens", false)],
      agentStatuses: {},
      maximizedPane: null,
    });
    expect(useWorkerBeesStore.getState().promoteToQueen("gitlens")).toBe(false);
    expect(useWorkerBeesStore.getState().promoteToQueen("claude-ext")).toBe(true);
    expect(useWorkerBeesStore.getState().queenOf(WS_A)?.id).toBe("claude-ext");
  });

  it("still allows only one crown per workhive, CLI or extension", () => {
    useWorkerBeesStore.setState({
      workerBees: [bee("a1", WS_A), ext("claude-ext", true)],
      agentStatuses: {},
      maximizedPane: null,
    });
    expect(useWorkerBeesStore.getState().promoteToQueen("claude-ext")).toBe(true);
    expect(useWorkerBeesStore.getState().promoteToQueen("a1")).toBe(false);
  });
});
