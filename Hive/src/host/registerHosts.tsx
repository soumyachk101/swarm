import { invoke } from "@tauri-apps/api/core";
import type { ColumnId } from "@hiveory/taskcomb";
import { MODE_SYSTEM_PROMPTS, type ToolContext } from "@hiveory/queenbee";
import { setQueenBeeHost, type CrownedBee } from "@hiveory/queenbee/ui";
import { setWorkerBeesHost, useWorkerBeesStore, WorkerBeePane } from "@hiveory/worker-bees/ui";
import { modelArgs } from "@hiveory/worker-bees/cli-configs";
import { OpenVsxPane } from "@hiveory/hiveextension";
import { extensionAgentProps } from "./extensionAgent";
import { setBeeVoiceHost } from "@hiveory/bee-voice/ui";
import {
  useDispatchStore, dispatchGoal, approveTask, rejectTask,
} from "@hiveory/hivemind/tauri";
import { useSettingsStore } from "@/features/settings/settingsStore";
import { useWorkHiveStore, workHiveForFolder, getActiveProjectPath, samePath } from "@hiveory/workhive";
import { useProjectStore } from "@hiveory/workhive";
import { useUiStore } from "@/shared/uiStore";
import { themeAccentHex } from "@/shared/themes";
import { useThemeStore } from "@/shared/themeStore";
import { useBrowserStore } from "@/features/browser/browserStore";

// Hive is the composer: every feature lives in its own package, and this file
// is the one place that tells those packages about each other and about the
// app shell (workHives, settings, chrome). Nothing here implements a feature —
// it only hands over the capabilities each package declared it needs.

/** Bindings for QueenBee's synchronous tools, scoped to one workhive. */
function toolContextFor(wsId: string): ToolContext {
  const ws = () => useWorkHiveStore.getState();
  const workhive = () => ws().workHives.find((w) => w.id === wsId);
  const bees = () => useWorkerBeesStore.getState();
  return {
    createWorkHive: (name) => {
      const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ws().addWorkHive({ id, name, color: themeAccentHex(useThemeStore.getState().themeId), boundProjectPath: "", taskCards: [] });
      return id;
    },
    listWorkHives: () => ws().workHives.map((w) => ({ id: w.id, name: w.name })),
    addTask: (title, description) => ws().addTask(wsId, title, description),
    listTasks: () =>
      (workhive()?.taskCards ?? []).map((t) => ({ id: t.id, title: t.title, column: t.column })),
    moveTask: (taskId, column) => {
      if (!workhive()?.taskCards.some((t) => t.id === taskId)) return false;
      ws().moveTask(wsId, taskId, column as ColumnId);
      return true;
    },
    // "Open Claude Code with opus at medium effort" becomes real CLI flags —
    // see modelArgs, which was written against each CLI's actual --help.
    launchWorkerBee: (cli, name, opts) =>
      bees().addWorkerBee({
        id: `bee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        cli, cliName: cli, customName: name, workHiveId: wsId,
        args: modelArgs(cli, opts?.model, opts?.effort),
        model: opts?.model,
        effort: opts?.effort,
      }),
    launchTerminal: (name) =>
      bees().addWorkerBee({
        id: `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        cli: "shell", cliName: "Terminal", customName: name, kind: "shell", workHiveId: wsId,
      }),
    setBoardOpen: (open) => ws().setBoardOpen(open),
    // The settings and folder pickers are window chrome the CLI can't reach.
    openSettings: () => false,
    deleteWorkHive: (id) => {
      if (!ws().workHives.some((w) => w.id === id)) return false;
      ws().deleteWorkHive(id);
      return true;
    },
    renameWorkHive: (id, name) => {
      if (!ws().workHives.some((w) => w.id === id)) return false;
      ws().renameWorkHive(id, name);
      return true;
    },
    recolorWorkHive: (id, color) => {
      if (!ws().workHives.some((w) => w.id === id)) return false;
      ws().setWorkHiveColor(id, color);
      return true;
    },
    switchWorkHive: (id) => {
      if (!ws().workHives.some((w) => w.id === id)) return false;
      ws().setActiveWorkHive(id);
      return true;
    },
    // Pane tools see this workhive's panes only — a queen must never rename or
    // kill an agent working in another folder.
    listWorkerBees: () =>
      bees().beesOf(wsId).map((b) => ({
        id: b.id, name: b.customName || b.cliName || b.cli, cli: b.cli,
        model: b.model, effort: b.effort,
      })),
    removeWorkerBee: (id) => {
      if (!bees().beesOf(wsId).some((b) => b.id === id)) return false;
      bees().removeWorkerBee(id);
      return true;
    },
    renameWorkerBee: (id, name) => {
      if (!bees().beesOf(wsId).some((b) => b.id === id)) return false;
      bees().updateWorkerBee(id, { customName: name });
      return true;
    },
    reorderWorkerBee: (from, to) => {
      const mine = bees().beesOf(wsId);
      if (from < 0 || from >= mine.length || to < 0 || to >= mine.length) return false;
      const all = bees().workerBees;
      bees().reorderWorkerBees(all.indexOf(mine[from]), all.indexOf(mine[to]));
      return true;
    },
    setDefaultWorkerBee: (cli) => useSettingsStore.getState().setDefaultWorkerBee(cli),
    setGridLayout: (layout) => {
      const named = ["auto", "grid", "cols", "rows", "master"];
      bees().setGridLayout(
        named.includes(layout) ? (layout as any) : (Number(layout) as any),
      );
    },
    listWorktrees: () =>
      (workhive()?.worktrees ?? []).map((t) => ({
        id: t.id, name: t.name, branch: t.branch, path: t.path,
      })),
    maximizePane: (id) => bees().setMaximizedPane(id),
    refitTerminals: () => bees().refitTerminals(),
    setLeftSidebar: (open) => useUiStore.getState().setLeftOpen(open),
    setRightDock: (open) => useUiStore.getState().setRightOpen(open),
  };
}

function launchBee(wsId: string, cli: string, name: string, args?: string[]): string {
  const id = `bee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const bees = useWorkerBeesStore.getState();
  bees.addWorkerBee({ id, cli, cliName: cli, customName: name, args, workHiveId: wsId });
  // Mark it launching so the pipeline shows the node active straight away,
  // rather than waiting for the pane to report in.
  bees.setAgentStatus(id, "launching");
  return id;
}

/**
 * Publish a queen's charter to <folder>/.nectar/queen/ROLE.md. The agent reads
 * it with the queen_role MCP tool — Hiveory never types a role prompt into a
 * CLI or an extension's chat box.
 */
function publishQueenRole(folder: string | null | undefined, mode: string): void {
  if (!folder) return;
  const text = MODE_SYSTEM_PROMPTS[mode as keyof typeof MODE_SYSTEM_PROMPTS];
  if (!text) return;
  const dir = `${folder}/.nectar/queen`;
  invoke("ensure_dir", { path: dir })
    .then(() => invoke("write_file", { path: `${dir}/ROLE.md`, content: text }))
    .catch((e) => console.error("[QueenBee] failed to publish role:", e));
}

/**
 * The queen's map of its own territory, appended to queen_role. With several
 * projects open at once a queen must know exactly which folder, trees and panes
 * are its own — and that the others are off limits. Sibling projects are
 * counted, never named: their paths are not this queen's business.
 */
function describeScope(folder: string): string {
  const ws = useWorkHiveStore.getState();
  const mine = ws.workHives.find((w) => samePath(w.boundProjectPath, folder));
  if (!mine) return `Your territory: ${folder} (no workhive is bound to it right now).`;

  const trees = mine.worktrees ?? [];
  const panes = useWorkerBeesStore.getState().beesOf(mine.id);
  const others = ws.workHives.filter((w) => w.boundProjectPath && w.id !== mine.id).length;
  const cards = mine.taskCards.length;

  return [
    "## Your territory",
    "",
    `You lead the workhive "${mine.name}", bound to ${mine.boundProjectPath}.`,
    `Its memory is ${mine.boundProjectPath}/.nectar — the only brain you read or write.`,
    "",
    trees.length
      ? `Worktrees (${trees.length}) — isolated checkouts your dispatches land in:\n${
          trees.map((t) => `  - ${t.name}: branch ${t.branch} @ ${t.path}`).join("\n")
        }`
      : "Worktrees: none yet. Dispatching a builder task creates one per task.",
    "",
    panes.length
      ? `Panes (${panes.length}): ${panes.map((p) => `${p.customName || p.cliName}${p.isQueen ? " [you]" : ""}`).join(", ")}`
      : "Panes: none besides you.",
    `Board: ${cards} card${cards === 1 ? "" : "s"}.`,
    "",
    others > 0
      ? `${others} other project${others === 1 ? " is" : "s are"} open in this app, each with its own QueenBee, worktrees and .nectar. They are NOT yours: never read, write, dispatch into or reason about a path outside ${mine.boundProjectPath}. Your tools only ever see this workhive, and requests aimed elsewhere are refused.`
      : "No other project is open. Everything you can see belongs to this one.",
  ].join("\n");
}

const asCrowned = (b: ReturnType<typeof useWorkerBeesStore.getState>["workerBees"][number] | undefined): CrownedBee | undefined =>
  b && { id: b.id, cliName: b.cliName, customName: b.customName, queenMode: b.queenMode };

/** Called once at boot, before anything renders. */
export function registerHosts(): void {
  setWorkerBeesHost({
    apiKeys: () => useSettingsStore.getState().apiKeys,
    openFilesFor: (folder) => useProjectStore.getState().openFilesFor(folder),
    activeWorkHiveId: () => useWorkHiveStore.getState().activeWorkHiveId,
    revealQueenDock: () => useUiStore.getState().setRightOpen(true),
    publishQueenRole,
  });

  setBeeVoiceHost({
    revealQueen: () => useUiStore.getState().setRightOpen(true),
    deliverToQueen: (text) => {
      const s = useWorkHiveStore.getState();
      const queen = useWorkerBeesStore.getState().queenOf(s.activeWorkHiveId);
      if (!queen) return; // nothing wears the crown — nowhere to dictate
      invoke("write_to_terminal", { paneId: queen.id, data: text }).catch((e) =>
        console.error("[Voice] write to QueenBee failed:", e),
      );
    },
  });

  setQueenBeeHost({
    workHiveIdForFolder: (folder) => workHiveForFolder(folder)?.id,
    toolContext: toolContextFor,
    launchBee,
    captureBrowser: (url) => useBrowserStore.getState().captureActive(url),

    useActiveWorkspaceId: () => useWorkHiveStore((s) => s.activeWorkHiveId),
    useActiveFolder: () =>
      useWorkHiveStore(
        (s) => s.workHives.find((w) => w.id === s.activeWorkHiveId)?.boundProjectPath || null,
      ),
    useBoundFolderKey: () =>
      useWorkHiveStore((s) =>
        s.workHives.map((w) => w.boundProjectPath).filter(Boolean).sort().join("|"),
      ),

    useQueen: (wsId) =>
      asCrowned(useWorkerBeesStore((s) => s.workerBees.find((b) => b.isQueen && b.workHiveId === wsId))),
    queenOf: (wsId) => asCrowned(useWorkerBeesStore.getState().queenOf(wsId)),
    setQueenMode: (beeId, mode) => useWorkerBeesStore.getState().setQueenMode(beeId, mode),
    publishRole: (mode) => publishQueenRole(getActiveProjectPath(), mode),
    QueenPane: ({ paneId, workingDir }) => {
      const bees = useWorkerBeesStore((s) => s.workerBees);
      const bee = bees.find((b) => b.id === paneId);
      if (!bee) return null;
      // A crowned agent extension keeps running in its editor pane — it just
      // does it from the QueenBee tab, with HIVEORY_QUEEN in its environment.
      if (bee.kind === "openvsx") {
        return (
          <OpenVsxPane
            paneId={paneId}
            workingDir={workingDir}
            tabName={bee.customName || bee.cliName}
            extensionId={bee.extensionId}
            onClose={() => useWorkerBeesStore.getState().demoteQueen(bee.workHiveId ?? "")}
            {...extensionAgentProps(bee, bees)}
          />
        );
      }
      return (
        <WorkerBeePane
          paneId={paneId}
          workingDir={workingDir}
          workerBee={bee}
          sharedMemoryDir={workingDir}
        />
      );
    },

    dispatchGoal: (goal, folder, wsId) =>
      dispatchGoal(goal, folder, {
        launchWorkerBee: (cli, displayName, cwd) =>
          launchBee(wsId, cli, displayName, cwd ? ["--cwd", cwd] : undefined),
        addCard: (card) => useWorkHiveStore.getState().addTaskCard(wsId, card),
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
