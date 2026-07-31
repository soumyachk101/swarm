"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, X, Check, RefreshCw, FolderPlus, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PANE_HEADER_CLASS, paneHeaderProps, themeForKind, activatable } from "@hiveory/honeyboard";
import { useWorkHiveStore } from "../store.js";
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
 * The workhive toolbox: one place to pick the skills and MCP servers that
 * every agent in this workhive gets. Nothing here is per-agent — a toolbox is
 * written into the workhive's folder and every tree under it, so WorkerBees
 * and the QueenBee all read the same set.
 */
export default function ToolboxPane({ paneId, onClose, onToggleMaximize, isMaximized, headerExtra }: Props) {
  const workHives = useWorkHiveStore((s) => s.workHives);
  const activeId = useWorkHiveStore((s) => s.activeWorkHiveId);
  const setSkills = useWorkHiveStore((s) => s.setSkills);
  const setMcpServers = useWorkHiveStore((s) => s.setMcpServers);
  const hive = workHives.find((w) => w.id === activeId);
  const toolbox = hive?.toolbox ?? EMPTY_TOOLBOX;

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
    } finally {
      setScanning(false);
    }
  };
  useEffect(() => { scan(); }, []);

  const chosen = useMemo(() => new Set(toolbox.skills.map((s) => s.name)), [toolbox.skills]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!hive) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      await fn();
      const trees = 1 + (hive.worktrees?.length ?? 0);
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
    run(already ? `Removed ${skill.name}` : `Added ${skill.name}`, () => setSkills(hive!.id, next));
  };

  const addSkillFolder = async () => {
    const picked = await openDialog({ directory: true, multiple: false, title: "Choose a skill folder" });
    if (typeof picked !== "string") return;
    const skill = await skillFromFolder(picked);
    if (!skill) {
      setError("That folder has no SKILL.md, so it is not a skill.");
      return;
    }
    run(`Added ${skill.name}`, () => setSkills(hive!.id, [...toolbox.skills, skill]));
  };

  const removeServer = (id: string) =>
    run("Removed server", () => setMcpServers(hive!.id, toolbox.mcpServers.filter((s) => s.id !== id)));

  const toggleServer = (id: string) =>
    run("Updated server", () =>
      setMcpServers(hive!.id, toolbox.mcpServers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))));

  const addServer = (spec: McpServerSpec) =>
    run(`Added ${spec.name}`, () => setMcpServers(hive!.id, [...toolbox.mcpServers, spec]));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div {...paneHeaderProps}>
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: theme.accent }} />
        <span className="truncate text-mini font-medium text-bee-text">Toolbox</span>
        {hive && <span className="truncate text-micro text-bee-textMuted">{hive.name}</span>}
        {headerExtra}
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={scan} title="Rescan installed skills"
            className="rounded p-1 text-bee-textMuted transition-colors hover:bg-bee-border/40 hover:text-bee-text">
            <RefreshCw className={`size-3 ${scanning ? "animate-spin text-bee-gold" : ""}`} />
          </button>
          {onToggleMaximize && (
            <button onClick={onToggleMaximize} title={isMaximized ? "Restore" : "Maximize"}
              className="rounded p-1 text-bee-textMuted transition-colors hover:bg-bee-border/40 hover:text-bee-text">
              {isMaximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} title="Close"
              className="rounded p-1 text-bee-textMuted transition-colors hover:bg-bee-err/25 hover:text-bee-err">
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {!hive ? (
        <p className="p-4 text-mini text-bee-textMuted">Open a workhive to give its agents a toolbox.</p>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-1 border-b border-bee-border/40 px-2 py-1.5">
            {(["skills", "mcp"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-md px-2 py-0.5 text-mini font-medium transition-colors ${
                  tab === t ? "bg-bee-gold/15 text-bee-goldHi" : "text-bee-textDim hover:bg-bee-border/40 hover:text-bee-text"
                }`}>
                {t === "skills" ? `Skills (${toolbox.skills.length})` : `MCP (${toolbox.mcpServers.length})`}
              </button>
            ))}
            <span className="ml-auto text-micro text-bee-textMuted">
              applies to every bee in this hive
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
            <div className={`shrink-0 border-t border-bee-border/40 px-3 py-1.5 text-micro ${error ? "text-bee-err" : "text-bee-textMuted"}`}>
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
        className="mb-1.5 flex w-full items-center gap-2 rounded-lg border border-dashed border-bee-border/70 px-2.5 py-2 text-mini text-bee-textDim transition-colors hover:border-bee-gold/40 hover:text-bee-text disabled:opacity-50">
        <FolderPlus className="size-3.5 text-bee-gold" />
        Add a skill folder…
      </button>

      {rows.length === 0 ? (
        <p className="px-2.5 py-6 text-center text-mini text-bee-textMuted">
          No skills found in your Claude skills folder yet.
        </p>
      ) : (
        rows.map((s) => {
          const on = chosen.has(s.name);
          return (
            <div key={s.id} onClick={() => !busy && onToggle(s)}
              {...activatable(() => !busy && onToggle(s), s.name)}
              className={`mb-0.5 flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                on ? "border-bee-gold/40 bg-bee-gold/[0.07]" : "border-transparent hover:bg-bee-border/25"
              }`}>
              <span className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border ${
                on ? "border-bee-gold bg-bee-gold/25 text-bee-goldHi" : "border-bee-border"
              }`}>
                {on && <Check className="size-2.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-mini font-medium text-bee-text">{skillFolderName(s.name)}</span>
                {s.description && (
                  <span className="mt-0.5 block line-clamp-2 text-micro leading-relaxed text-bee-textMuted">
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
      <div className="mb-2 space-y-1.5 rounded-lg border border-bee-border/60 glass-inset p-2">
        <div className="flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="server name"
            className="min-w-0 flex-1 rounded border border-bee-border/60 glass-inset px-1.5 py-1 text-mini text-bee-text outline-none focus:border-bee-gold/50" />
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="command"
            className="w-20 shrink-0 rounded border border-bee-border/60 glass-inset px-1.5 py-1 text-mini text-bee-text outline-none focus:border-bee-gold/50" />
        </div>
        <div className="flex gap-1.5">
          <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="args, space separated"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="min-w-0 flex-1 rounded border border-bee-border/60 glass-inset px-1.5 py-1 text-mini text-bee-text outline-none focus:border-bee-gold/50" />
          <button onClick={submit} disabled={!name.trim() || busy}
            className="flex shrink-0 items-center gap-1 rounded border border-bee-gold/30 bg-bee-gold/15 px-2 py-1 text-mini font-medium text-bee-goldHi transition-colors hover:bg-bee-gold/25 disabled:opacity-40">
            <Plus className="size-3" /> Add
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <p className="px-2.5 py-6 text-center text-mini text-bee-textMuted">
          No MCP servers yet. Nectar is wired in separately and always available.
        </p>
      ) : (
        servers.map((s) => (
          <div key={s.id}
            className="mb-0.5 flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 hover:bg-bee-border/25">
            <button onClick={() => onToggle(s.id)} disabled={busy} title={s.enabled ? "Disable" : "Enable"}
              className={`flex size-3.5 shrink-0 items-center justify-center rounded border ${
                s.enabled ? "border-bee-gold bg-bee-gold/25 text-bee-goldHi" : "border-bee-border"
              }`}>
              {s.enabled && <Check className="size-2.5" />}
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-mini font-medium text-bee-text">{s.name}</span>
              <span className="block truncate font-mono text-micro text-bee-textMuted">
                {s.command} {s.args.join(" ")}
              </span>
            </span>
            <button onClick={() => onRemove(s.id)} disabled={busy} title="Remove"
              className="rounded p-1 text-bee-textMuted transition-colors hover:bg-bee-err/25 hover:text-bee-err">
              <Trash2 className="size-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
