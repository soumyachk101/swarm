import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LeadMode } from "../modes.js";
import { leadHost } from "./host.js";
import { runLeadTool } from "./leadTools.js";

// Each crowned CLI runs in its own process, so its MCP server can't touch the
// app's stores directly. It drops a request file in <its folder>/.pheromone/lead/
// and waits for the matching response; this loop is the other end.
//
// One loop per bound folder: with several folders open, folder A's lead is
// answered out of folder A's agent and can never see folder B's state.
//
// ponytail: file drop + 400ms poll, no ports, no new Tauri commands. Move to a
// localhost socket if the round-trip latency ever shows.
const LEAD_DIR = ".pheromone/lead";
const POLL_MS = 400;
// Requests older than this are leftovers from a dead CLI — never replayed.
const STALE_MS = 60_000;

interface LeadRequest {
  id: string;
  paneId?: string;
  tool: string;
  args?: Record<string, unknown>;
  ts?: number;
}

async function handleRequest(folder: string, dir: string, file: string): Promise<void> {
  let req: LeadRequest;
  try {
    req = JSON.parse(await invoke<string>("read_file", { path: `${dir}/${file}` }));
  } catch {
    return; // half-written or unreadable — the next tick sees the finished file
  }
  if (!req?.id || !req?.tool) return;
  if (req.ts && Date.now() - req.ts > STALE_MS) return;

  const wsId = leadHost().workspaceIdForFolder(folder);
  const lead = wsId ? leadHost().leadOf(wsId) : undefined;
  const mode: LeadMode = lead?.leadMode ?? "Steward";

  let text: string;
  if (!wsId) {
    text = `Error: no agent is bound to ${folder} any more.`;
  } else if (!lead) {
    text = "Error: no Agent wears this folder's crown, so Lead powers are unavailable.";
  } else if (req.paneId && req.paneId !== lead.id) {
    // Either an ordinary Agent reaching for the crown's tools, or a lead
    // from another folder writing into this one's dir. Both get refused.
    text = `Error: only this folder's Lead may use that tool. "${lead.customName || lead.cliName}" holds the crown.`;
  } else {
    text = await runLeadTool(mode, req.tool, req.args || {}, folder);
  }

  await invoke("write_file", {
    path: `${dir}/res-${req.id}.json`,
    content: JSON.stringify({ id: req.id, text }),
  });
}

/** Poll every bound folder's lead dir. Re-subscribes as folders come and go. */
export function useLeadBridge(): void {
  // Recomputed as a string so the effect only restarts when the set of bound
  // folders actually changes, not on every unrelated agent edit.
  const folderKey = leadHost().useBoundFolderKey();

  useEffect(() => {
    const folders = folderKey ? folderKey.split("|") : [];
    if (folders.length === 0) return;
    let stopped = false;
    const handled = new Set<string>();

    const tick = async (folder: string) => {
      const dir = `${folder}/${LEAD_DIR}`;
      try {
        const entries = await invoke<Array<{ name: string; is_file: boolean }>>(
          "list_directory",
          { path: dir },
        );
        for (const e of entries) {
          const key = `${folder}|${e.name}`;
          if (!e.is_file || !e.name.startsWith("req-") || handled.has(key)) continue;
          handled.add(key);
          // The CLI side deletes both files once it reads the response, so this
          // set only has to outlive one request, not the session.
          await handleRequest(folder, dir, e.name);
        }
      } catch {
        // dir not created yet (no lead has spoken) — nothing to do
      }
    };

    for (const folder of folders) {
      invoke("ensure_dir", { path: `${folder}/${LEAD_DIR}` }).catch(() => {});
    }
    const timer = setInterval(() => {
      if (stopped) return;
      for (const folder of folders) tick(folder);
    }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [folderKey]);
}
