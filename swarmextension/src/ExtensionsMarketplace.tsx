"use client";

import { useEffect } from "react";
import { Blocks, Check, Download, X } from "lucide-react";
import { LeadCrown } from "@swarm/board";
import { EXTENSION_CATALOG, type CatalogEntry, type ExtensionRole } from "./catalog";
import { useExtensionStore } from "./extensionStore";

/**
 * Swarm's extension shelf. Deliberately curated rather than a window onto the
 * whole Open-VSX registry: a handful of agents that can join the swarm, plus a
 * couple of development tools. Added ones show up in the Board + menu.
 */
const SECTIONS: { role: ExtensionRole; title: string; blurb: string }[] = [
  {
    role: "agent",
    title: "Agents",
    blurb: "Run as Agents. Crown one and it leads the swarm as Lead.",
  },
  {
    role: "tool",
    title: "Tools",
    blurb: "Ordinary editor panes for everyday development work.",
  },
];

export default function ExtensionsMarketplace({ onClose }: { onClose: () => void }) {
  const installed = useExtensionStore((s) => s.installed);
  const install = useExtensionStore((s) => s.install);
  const uninstall = useExtensionStore((s) => s.uninstall);
  const isInstalled = useExtensionStore((s) => s.isInstalled);

  // Clicking the backdrop closes it; Escape has to as well, or keyboard users
  // are trapped in a modal with no way out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Card = ({ e }: { e: CatalogEntry }) => {
    const has = isInstalled(e.id);
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-swarm-border/40 glass-inset p-2.5 transition-colors hover:border-swarm-border/70">
        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md glass-inset">
          {e.role === "agent" ? (
            <LeadCrown size={16} className="text-swarm-gold" />
          ) : (
            <Blocks className="size-4 text-swarm-gold" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-swarm-text">{e.name}</span>
            <span className="shrink-0 text-micro text-swarm-textMuted">{e.publisher}</span>
          </div>
          <p className="mt-0.5 text-micro leading-[1.4] text-swarm-textMuted">{e.description}</p>
        </div>
        {has ? (
          <button
            onClick={() => uninstall(e.id)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-swarm-border/60 px-2 py-1 text-micro font-medium text-swarm-textDim hover:text-swarm-err"
            title="Remove"
          >
            <Check className="size-3 text-swarm-ok" /> Added
          </button>
        ) : (
          <button
            onClick={() => install({ id: e.id, name: e.name, publisher: e.publisher, role: e.role })}
            className="flex shrink-0 items-center gap-1 rounded-md border border-swarm-gold/30 bg-swarm-gold/15 px-2 py-1 text-micro font-semibold text-swarm-goldHi hover:bg-swarm-gold/25"
          >
            <Download className="size-3" /> Get
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[min(760px,92vw)] flex-col overflow-hidden rounded-2xl glass-hi glass-sheen shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Extensions"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-swarm-border/50 glass-toolbar px-3">
          <Blocks className="size-4 text-swarm-gold" />
          <span className="text-sm font-semibold text-swarm-text">Extensions</span>
          <span className="text-mini text-swarm-textMuted">curated for the swarm</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-swarm-textMuted hover:bg-swarm-border/40 hover:text-swarm-text">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-sleek p-3">
          {SECTIONS.map((section) => (
            <div key={section.role}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <h3 className="text-mini font-semibold uppercase tracking-wider text-swarm-gold">
                  {section.title}
                </h3>
                <span className="text-micro text-swarm-textMuted">{section.blurb}</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {EXTENSION_CATALOG.filter((e) => e.role === section.role).map((e) => (
                  <Card key={e.id} e={e} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-swarm-border/40 px-3 py-1.5 text-micro text-swarm-textMuted">
          {installed.length > 0
            ? <>{installed.length} added — open them from the Board <span className="text-swarm-gold">+</span> menu.</>
            : <>Add one, then open it from the Board <span className="text-swarm-gold">+</span> menu.</>}
        </div>
      </div>
    </div>
  );
}
