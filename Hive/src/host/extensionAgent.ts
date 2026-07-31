import { useWorkerBeesStore, type WorkerBee } from "@hiveory/worker-bees/ui";

// An agent extension (Claude Code, Kilo Code, OpenChamber) is a WorkerBee that
// happens to run inside an editor pane rather than a pty. Hive is the only place
// that knows both packages, so the crown wiring and the queen env live here.
//
// The env is what makes a crowned extension a real QueenBee: openvscode-server
// inherits it, the agent extension spawns its MCP servers as children, and the
// nectar-mcp server advertises QueenBee's tools exactly as it does for a CLI.
export function extensionAgentProps(bee: WorkerBee, bees: WorkerBee[]) {
  if (!bee.agentExt) return {};
  const queen = bees.find((b) => b.isQueen && b.workHiveId === bee.workHiveId);
  const isQueen = queen?.id === bee.id;
  const env: Record<string, string> = { HIVEORY_PANE_ID: bee.id };
  if (isQueen) env.HIVEORY_QUEEN = "1";
  return {
    env,
    crown: {
      isQueen,
      taken: !!queen && !isQueen,
      onToggle: () => {
        const s = useWorkerBeesStore.getState();
        if (isQueen) s.demoteQueen(bee.workHiveId ?? "");
        else s.promoteToQueen(bee.id);
      },
    },
  };
}
