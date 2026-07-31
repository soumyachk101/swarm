import { invoke } from "@tauri-apps/api/core";
import type { ColumnId } from "@swarm/tasks";
import { MODE_SYSTEM_PROMPTS, type ToolContext } from "@swarm/lead";
import { setLeadHost, type CrownedSwarm } from "@swarm/lead/ui";
import { setAgentsHost, useAgentsStore, AgentPane } from "@swarm/agents/ui";
import { modelArgs } from "@swarm/agents/cli-configs";
import { OpenVsxPane } from "@swarm/extension";
import { extensionAgentProps } from "./extensionAgent";
import { setVoiceHost } from "@swarm/voice/ui";
import {
  useDispatchStore, dispatchGoal, approveTask, rejectTask,
} from "@swarm/mind/tauri";
import { useSettingsStore } from "@/features/settings/settingsStore";
import { useWorkspaceStore, workspaceForFolder, getActiveProjectPath, samePath } from "@swarm/workspace";
import { useProjectStore } from "@swarm/workspace";
import { useUiStore } from "@/shared/uiStore";
import { themeAccentHex } from "@/shared/themes";
import { useThemeStore } from "@/shared/themeStore";
import { useBrowserStore } from "@/features/browser/browserStore";

// Swarm is the composer: every feature lives in its own package, and this file
// is the one place that tells those packages about each other and about the
// app shell (workspaces, settings, chrome). Nothing here implements a feature —
// it only hands over the capabilities each package declared it needs.

/** Bindings for Lead's synchronous tools, scoped to one agent. */
function toolContextFor(wsId: string): ToolContext {
  const ws = () => useWorkspaceStore.getState();
  const agent = () => ws().workspaces.find((w) => w.id === wsId);
  const swarms = () => useAgentsStore.getState();
  return {
    createWorkspace: (name) => {
      const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ws().addWorkspace({ id, name, color: themeAccentHex(useThemeStore.getState().themeId), boundProjectPath: "", taskCards: [] });
      return id;
    },
    listWorkspaces: () => ws().workspaces.map((w) => ({ id: w.id, name: w.name })),
    addTask: (title, description) => ws().addTask(wsId, title, description),
    listTasks: () =>
      (agent()?.taskCards ?? []).map((t) => ({ id: t.id, title: t.title, column: t.column })),
    moveTask: (taskId, column) => {
      if (!agent()?.taskCards.some((t) => t.id === taskId)) return false;
      ws().moveTask(wsId, taskId, column as ColumnId);
      return true;
    },
    // "Open Claude Code with opus at medium effort" becomes real CLI flags —
    // see modelArgs, which was written against each CLI's actual --help.
    launchAgent: (cli, name, opts) =>
      swarms().addAgent({
        id: `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        cli, cliName: cli, customName: name, workspaceId: wsId,
        args: modelArgs(cli, opts?.model, opts?.effort),
        model: opts?.model,
        effort: opts?.effort,
      }),
    launchTerminal: (name) =>
      swarms().addAgent({
        id: `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        cli: "shell", cliName: "Terminal", customName: name, kind: "shell", workspaceId: wsId,
      }),
    setBoardOpen: (open) => ws().setBoardOpen(open),
    // The settings and folder pickers are window chrome the CLI can't reach.
    openSettings: () => false,
    deleteWorkspace: (id) => {
      if (!ws().workspaces.some((w) => w.id === id)) return false;
      ws().deleteWorkspace(id);
      return true;
    },
    renameWorkspace: (id, name) => {
      if (!ws().workspaces.some((w) => w.id === id)) return false;
      ws().renameWorkspace(id, name);
      return true;
    },
    recolorWorkspace: (id, color) => {
      if (!ws().workspaces.some((w) => w.id === id)) return false;
      ws().setWorkspaceColor(id, color);
      return true;
    },
    switchWorkspace: (id) => {
      if (!ws().workspaces.some((w) => w.id === id)) return false;
      ws().setActiveWorkspace(id);
      return true;
    },
    // Pane tools see this agent's panes only — a lead must never rename or
    // kill an agent working in another folder.
    listAgents: () =>
      swarms().swarmsOf(wsId).map((b) => ({
        id: b.id, name: b.customName || b.cliName || b.cli, cli: b.cli,
        model: b.model, effort: b.effort,
      })),
    removeAgent: (id) => {
      if (!swarms().swarmsOf(wsId).some((b) => b.id === id)) return false;
      swarms().removeAgent(id);
      return true;
    },
    renameAgent: (id, name) => {
      if (!swarms().swarmsOf(wsId).some((b) => b.id === id)) return false;
      swarms().updateAgent(id, { customName: name });
      return true;
    },
    reorderAgent: (from, to) => {
      const mine = swarms().swarmsOf(wsId);
      if (from < 0 || from >= mine.length || to < 0 || to >= mine.length) return false;
      const all = swarms().agents;
      swarms().reorderAgents(all.indexOf(mine[from]), all.indexOf(mine[to]));
      return true;
    },
    setDefaultAgent: (cli) => useSettingsStore.getState().setDefaultAgent(cli),
    setGridLayout: (layout) => {
      const named = ["auto", "grid", "cols", "rows", "master"];
      swarms().setGridLayout(
        named.includes(layout) ? (layout as any) : (Number(layout) as any),
      );
    },
    listWorktrees: () =>
      (agent()?.worktrees ?? []).map((t) => ({
        id: t.id, name: t.name, branch: t.branch, path: t.path,
      })),
    maximizePane: (id) => swarms().setMaximizedPane(id),
    refitTerminals: () => swarms().refitTerminals(),
    setLeftSidebar: (open) => useUiStore.getState().setLeftOpen(open),
    setRightDock: (open) => useUiStore.getState().setRightOpen(open),
  };
}

function launchSwarm(wsId: string, cli: string, name: string, args?: string[]): string {
  const id = `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const swarms = useAgentsStore.getState();
  swarms.addAgent({ id, cli, cliName: cli, customName: name, args, workspaceId: wsId });
  // Mark it launching so the pipeline shows the node active straight away,
  // rather than waiting for the pane to report in.
  swarms.setAgentStatus(id, "launching");
  return id;
}

/**
 * Publish a lead's charter to <folder>/.pheromone/lead/ROLE.md. The agent reads
 * it with the lead_role MCP tool — Swarm never types a role prompt into a
 * CLI or an extension's chat box.
 */
function publishLeadRole(folder: string | null | undefined, mode: string): void {
  if (!folder) return;
  const text = MODE_SYSTEM_PROMPTS[mode as keyof typeof MODE_SYSTEM_PROMPTS];
  if (!text) return;
  const dir = `${folder}/.pheromone/lead`;
  invoke("ensure_dir", { path: dir })
    .then(() => invoke("write_file", { path: `${dir}/ROLE.md`, content: text }))
    .catch((e) => console.error("[Lead] failed to publish role:", e));
}

/**
 * The lead's map of its own territory, appended to lead_role. With several
 * projects open at once a lead must know exactly which folder, trees and panes
 * are its own — and that the others are off limits. Sibling projects are
 * counted, never named: their paths are not this lead's business.
 */
function describeScope(folder: string): string {
  const ws = useWorkspaceStore.getState();
  const mine = ws.workspaces.find((w) => samePath(w.boundProjectPath, folder));
  if (!mine) return `Your territory: ${folder} (no agent is bound to it right now).`;

  const trees = mine.worktrees ?? [];
  const panes = useAgentsStore.getState().swarmsOf(mine.id);
  const others = ws.workspaces.filter((w) => w.boundProjectPath && w.id !== mine.id).length;
  const cards = mine.taskCards.length;

  return [
    "## Your territory",
    "",
    `You lead the agent "${mine.name}", bound to ${mine.boundProjectPath}.`,
    `Its memory is ${mine.boundProjectPath}/.pheromone — the only brain you read or write.`,
    "",
    trees.length
      ? `Worktrees (${trees.length}) — isolated checkouts your dispatches land in:\n${
          trees.map((t) => `  - ${t.name}: branch ${t.branch} @ ${t.path}`).join("\n")
        }`
      : "Worktrees: none yet. Dispatching a builder task creates one per task.",
    "",
    panes.length
      ? `Panes (${panes.length}): ${panes.map((p) => `${p.customName || p.cliName}${p.isLead ? " [you]" : ""}`).join(", ")}`
      : "Panes: none besides you.",
    `Board: ${cards} card${cards === 1 ? "" : "s"}.`,
    "",
    others > 0
      ? `${others} other project${others === 1 ? " is" : "s are"} open in this app, each with its own Lead, worktrees and .pheromone. They are NOT yours: never read, write, dispatch into or reason about a path outside ${mine.boundProjectPath}. Your tools only ever see this agent, and requests aimed elsewhere are refused.`
      : "No other project is open. Everything you can see belongs to this one.",
  ].join("\n");
}

const asCrowned = (b: ReturnType<typeof useAgentsStore.getState>["agents"][number] | undefined): CrownedSwarm | undefined =>
  b && { id: b.id, cliName: b.cliName, customName: b.customName, leadMode: b.leadMode };

/** Called once at boot, before anything renders. */
export function registerHosts(): void {
  setAgentsHost({
    apiKeys: () => useSettingsStore.getState().apiKeys,
    openFilesFor: (folder) => useProjectStore.getState().openFilesFor(folder),
    activeWorkspaceId: () => useWorkspaceStore.getState().activeWorkspaceId,
    revealLeadDock: () => useUiStore.getState().setRightOpen(true),
    publishLeadRole,
  });

  setVoiceHost({
    revealLead: () => useUiStore.getState().setRightOpen(true),
    deliverToLead: (text) => {
      const s = useWorkspaceStore.getState();
      const lead = useAgentsStore.getState().leadOf(s.activeWorkspaceId);
      if (!lead) return; // nothing wears the crown — nowhere to dictate
      invoke("write_to_terminal", { paneId: lead.id, data: text }).catch((e) =>
        console.error("[Voice] write to Lead failed:", e),
      );
    },
  });

  setLeadHost({
    workspaceIdForFolder: (folder) => workspaceForFolder(folder)?.id,
    toolContext: toolContextFor,
    launchSwarm,
    captureBrowser: (url) => useBrowserStore.getState().captureActive(url),

    useActiveWorkspaceId: () => useWorkspaceStore((s) => s.activeWorkspaceId),
    useActiveFolder: () =>
      useWorkspaceStore(
        (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.boundProjectPath || null,
      ),
    useBoundFolderKey: () =>
      useWorkspaceStore((s) =>
        s.workspaces.map((w) => w.boundProjectPath).filter(Boolean).sort().join("|"),
      ),

    useLead: (wsId) =>
      asCrowned(useAgentsStore((s) => s.agents.find((b) => b.isLead && b.workspaceId === wsId))),
    leadOf: (wsId) => asCrowned(useAgentsStore.getState().leadOf(wsId)),
    setLeadMode: (swarmId, mode) => useAgentsStore.getState().setLeadMode(swarmId, mode),
    publishRole: (mode) => publishLeadRole(getActiveProjectPath(), mode),
    LeadPane: ({ paneId, workingDir }) => {
      const swarms = useAgentsStore((s) => s.agents);
      const swarm = swarms.find((b) => b.id === paneId);
      if (!swarm) return null;
      // A crowned agent extension keeps running in its editor pane — it just
      // does it from the Lead tab, with SWARM_LEAD in its environment.
      if (swarm.kind === "openvsx") {
        return (
          <OpenVsxPane
            paneId={paneId}
            workingDir={workingDir}
            tabName={swarm.customName || swarm.cliName}
            extensionId={swarm.extensionId}
            onClose={() => useAgentsStore.getState().demoteLead(swarm.workspaceId ?? "")}
            {...extensionAgentProps(swarm, swarms)}
          />
        );
      }
      return (
        <AgentPane
          paneId={paneId}
          workingDir={workingDir}
          agent={swarm}
          sharedMemoryDir={workingDir}
        />
      );
    },

    dispatchGoal: (goal, folder, wsId) =>
      dispatchGoal(goal, folder, {
        launchAgent: (cli, displayName, cwd) =>
          launchSwarm(wsId, cli, displayName, cwd ? ["--cwd", cwd] : undefined),
        addCard: (card) => useWorkspaceStore.getState().addTaskCard(wsId, card),
      }).then((results) => {
        // Remember each worktree so approve_task can merge it later.
        for (const r of results) {
          if (r.worktree && !r.error) {
            useDispatchStore.getState().record(folder, {
              taskId: r.taskId, title: r.title, cli: r.cli,
              branch: r.worktree.branch, worktreePath: r.worktree.path,
            });
          }
        }
        return results;
      }),
    approveTask: async (folder, taskId) => {
      const entry = useDispatchStore.getState().get(folder, taskId)!;
      const { merged, viaOrchestrator } = await approveTask(folder, taskId, {
        branch: entry.branch,
        worktreePath: entry.worktreePath,
      });
      useDispatchStore.getState().remove(folder, taskId);
      return { merged, viaOrchestrator, branch: entry.branch };
    },
    rejectTask: async (folder, taskId, notes) => {
      const entry = useDispatchStore.getState().get(folder, taskId)!;
      const { viaOrchestrator } = await rejectTask(folder, taskId, notes);
      return { viaOrchestrator, branch: entry.branch };
    },
    dispatchedIn: (folder) => useDispatchStore.getState().listFor(folder),
    describeScope,
  });
}
