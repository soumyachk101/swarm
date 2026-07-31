"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Check, RefreshCw, FolderPlus, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PANE_HEADER_CLASS, paneHeaderProps, themeForKind, activatable } from "@swarm/board";
import { useWorkspaceStore } from "../store.js";
import { EMPTY_TOOLBOX, skillFolderName, type McpServerSpec, type SkillSpec } from "../toolbox.js";
import { discoverInstalledSkills, skillFromFolder } from "../toolboxIO.js";

interface Props {
  paneId: string;
  onClose?: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
  headerExtra?: React.ReactNode;
}

type Tab = "skills" | "mcp";

/**
 * The workspace toolbox: one place to pick the skills and MCP servers that
 * every agent in this workspace gets. Nothing here is per-agent — a toolbox is
 * written into the workspace's folder and every tree under it, so Agents
 * and the Lead all read the same set.
 */
export default function ToolboxPane({ paneId, onClose, onToggleMaximize, isMaximized, headerExtra }: Props) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setSkills = useWorkspaceStore((s) => s.setSkills);
  const setMcpServers = useWorkspaceStore((s) => s.setMcpServers);
  const swarm = workspaces.find((w) => w.id === activeId);
  const toolbox = swarm?.toolbox ?? EMPTY_TOOLBOX;

  const [tab, setTab] = useState<Tab>("skills");
  const [available, setAvailable] = useState<SkillSpec[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const theme = themeForKind("toolbox");

  const scan = async () => {
    setScanning(true);
    try {
      setAvailable(await discoverInstalledSkills());
      setError(null);
    } catch (e: any) {
      // Without this the scan failed as an unhandled rejection and the list just
      // stayed empty — indistinguishable from "you have no skills installed".
      setError(`Couldn't scan skills: ${String(e?.message ?? e)}`);
    } finally {
      setScanning(false);
    }
  };
  useEffect(() => { scan(); }, []);

  // A success line that never leaves reads as the current state of the pane
  // rather than as the result of the click that produced it.
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const chosen = useMemo(() => new Set(toolbox.skills.map((s) => s.name)), [toolbox.skills]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!swarm) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      await fn();
      const trees = 1 + (swarm.worktrees?.length ?? 0);
      setStatus(`${label} · applied to ${trees} tree${trees === 1 ? "" : "s"}`);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const toggleSkill = (skill: SkillSpec) => {
    const already = toolbox.skills.find((s) => s.name === skill.name);
    const next = already
      ? toolbox.skills.filter((s) => s.name !== skill.name)
      : [...toolbox.skills, { ...skill, enabled: true }];
    run(already ? `Removed ${skill.name}` : `Added ${skill.name}`, () => setSkills(swarm!.id, next));
  };

  const addSkillFolder = async () => {
    try {
      const picked = await openDialog({ directory: true, multiple: false, title: "Choose a skill folder" });
      if (typeof picked !== "string") return;
      const skill = await skillFromFolder(picked);
      if (!skill) {
        setError("That folder has no SKILL.md, so it is not a skill.");
        return;
      }
      run(`Added ${skill.name}`, () => setSkills(swarm!.id, [...toolbox.skills, skill]));
    } catch (e: any) {
      // An unreadable folder threw past the button handler as an unhandled
      // rejection: the picker closed and the pane looked like it did nothing.
      setError(String(e?.message ?? e));
    }
  };

  const removeServer = (id: string) =>
    run("Removed server", () => setMcpServers(swarm!.id, toolbox.mcpServers.filter((s) => s.id !== id)));

  const toggleServer = (id: string) =>
    run("Updated server", () =>
      setMcpServers(swarm!.id, toolbox.mcpServers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))));

  const addServer = (spec: McpServerSpec) =>
    run(`Added ${spec.name}`, () => setMcpServers(swarm!.id, [...toolbox.mcpServers, spec]));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div {...paneHeaderProps}>
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: theme.accent }} />
        <span className="shrink-0 text-mini font-medium text-swarm-text">Toolbox</span>
        {/* The workspace name is the part that must give: a fixed "Toolbox" label
            that truncates before an unbounded name is backwards. */}
        {swarm && <span className="min-w-0 truncate text-micro text-swarm-textMuted" title={swarm.name}>{swarm.name}</span>}
        {headerExtra}
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={scan} title="Rescan installed skills"
            className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-swarm-border/40 hover:text-swarm-text">
            <RefreshCw className={`size-3 ${scanning ? "animate-spin text-swarm-gold" : ""}`} />
          </button>
          {onToggleMaximize && (
            <button onClick={onToggleMaximize} title={isMaximized ? "Restore" : "Maximize"}
              className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-swarm-border/40 hover:text-swarm-text">
              {isMaximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} title="Close"
              className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-swarm-err/25 hover:text-swarm-err">
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {!swarm ? (
        <p className="p-4 text-mini text-swarm-textMuted">Open a workspace to give its agents a toolbox.</p>
      ) : (
        <>
          <div className="flex h-8 shrink-0 items-center gap-1 border-b border-swarm-border/40 px-2">
            {(["skills", "mcp"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex h-[26px] items-center rounded-md px-2 text-mini font-medium transition-colors ${
                  tab === t ? "bg-swarm-gold/15 text-swarm-goldHi" : "text-swarm-textDim hover:bg-swarm-border/40 hover:text-swarm-text"
                }`}>
                {t === "skills" ? `Skills (${toolbox.skills.length})` : `MCP (${toolbox.mcpServers.length})`}
              </button>
            ))}
            <span className="ml-auto truncate pl-2 text-micro text-swarm-textMuted">
              applies to every agent in this workspace
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
            {tab === "skills" ? (
              <SkillsTab
                available={available}
                chosen={chosen}
                toolboxSkills={toolbox.skills}
                busy={busy}
                onToggle={toggleSkill}
                onAddFolder={addSkillFolder}
              />
            ) : (
              <McpTab
                servers={toolbox.mcpServers}
                busy={busy}
                onAdd={addServer}
                onRemove={removeServer}
                onToggle={toggleServer}
              />
            )}
          </div>

          {(status || error) && (
            <div className={`shrink-0 border-t border-swarm-border/40 px-3 py-1.5 text-micro ${error ? "text-swarm-err" : "text-swarm-textMuted"}`}>
              {error ?? status}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SkillsTab({
  available, chosen, toolboxSkills, busy, onToggle, onAddFolder,
}: {
  available: SkillSpec[];
  chosen: Set<string>;
  toolboxSkills: SkillSpec[];
  busy: boolean;
  onToggle: (s: SkillSpec) => void;
  onAddFolder: () => void;
}) {
  // Skills added from a folder are not in the discovered list, so show both
  // without listing anything twice.
  const extras = toolboxSkills.filter((s) => !available.some((a) => a.name === s.name));
  const rows = [...available, ...extras];

  return (
    <div className="p-1.5">
      <button onClick={onAddFolder} disabled={busy}
        className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-swarm-border/70 px-2.5 py-2 text-mini text-swarm-textDim transition-colors hover:border-swarm-gold/40 hover:text-swarm-text disabled:opacity-50">
        <FolderPlus className="size-3.5 text-swarm-gold" />
        Add a skill folder…
      </button>

      {rows.length === 0 ? (
        <p className="px-2.5 py-6 text-center text-mini text-swarm-textMuted">
          No skills found in your Claude skills folder yet.
        </p>
      ) : (
        rows.map((s) => {
          const on = chosen.has(s.name);
          return (
            <div key={s.id} onClick={() => !busy && onToggle(s)}
              {...activatable(() => !busy && onToggle(s), s.name)}
              className={`mb-0.5 flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                on ? "border-swarm-gold/40 bg-swarm-gold/[0.07]" : "border-transparent hover:bg-swarm-border/25"
              }`}>
              <span className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border ${
                on ? "border-swarm-gold bg-swarm-gold/25 text-swarm-goldHi" : "border-swarm-border"
              }`}>
                {on && <Check className="size-2.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-mini font-medium text-swarm-text">{skillFolderName(s.name)}</span>
                {s.description && (
                  <span className="mt-0.5 block line-clamp-2 text-micro leading-relaxed text-swarm-textMuted">
                    {s.description}
                  </span>
                )}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function McpTab({
  servers, busy, onAdd, onRemove, onToggle,
}: {
  servers: McpServerSpec[];
  busy: boolean;
  onAdd: (s: McpServerSpec) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");

  const submit = () => {
    const key = name.trim();
    if (!key || busy) return;
    onAdd({
      id: `mcp-${Date.now()}`,
      name: key,
      command: command.trim() || "npx",
      // Split on whitespace, the way a shell would, so pasting a documented
      // command line works without the user re-typing it as JSON.
      args: args.trim() ? args.trim().split(/\s+/) : [],
      enabled: true,
    });
    setName(""); setArgs("");
  };

  return (
    <div className="p-1.5">
      <div className="mb-2 space-y-1.5 rounded-lg border border-swarm-border/60 glass-inset p-2">
        <div className="flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="server name"
            className="min-w-0 flex-1 rounded border border-swarm-border/60 glass-inset px-1.5 py-1 text-mini text-swarm-text outline-none focus:border-swarm-gold/50" />
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="command"
            className="w-20 shrink-0 rounded border border-swarm-border/60 glass-inset px-1.5 py-1 text-mini text-swarm-text outline-none focus:border-swarm-gold/50" />
        </div>
        <div className="flex gap-1.5">
          <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="args, space separated"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="min-w-0 flex-1 rounded border border-swarm-border/60 glass-inset px-1.5 py-1 text-mini text-swarm-text outline-none focus:border-swarm-gold/50" />
          <button onClick={submit} disabled={!name.trim() || busy}
            className="flex shrink-0 items-center gap-1 rounded border border-swarm-gold/30 bg-swarm-gold/15 px-2 py-1 text-mini font-medium text-swarm-goldHi transition-colors hover:bg-swarm-gold/25 disabled:opacity-40">
            <Plus className="size-3" /> Add
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <p className="px-2.5 py-6 text-center text-mini text-swarm-textMuted">
          No MCP servers yet. Pheromone is wired in separately and always available.
        </p>
      ) : (
        servers.map((s) => (
          <div key={s.id}
            className="mb-0.5 flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 hover:bg-swarm-border/25">
            <button onClick={() => onToggle(s.id)} disabled={busy} title={s.enabled ? "Disable" : "Enable"}
              className={`flex size-3.5 shrink-0 items-center justify-center rounded border ${
                s.enabled ? "border-swarm-gold bg-swarm-gold/25 text-swarm-goldHi" : "border-swarm-border"
              }`}>
              {s.enabled && <Check className="size-2.5" />}
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-mini font-medium text-swarm-text">{s.name}</span>
              <span className="block truncate font-mono text-micro text-swarm-textMuted">
                {s.command} {s.args.join(" ")}
              </span>
            </span>
            <button onClick={() => onRemove(s.id)} disabled={busy} title="Remove"
              className="rounded p-1 text-swarm-textMuted transition-colors hover:bg-swarm-err/25 hover:text-swarm-err">
              <Trash2 className="size-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
