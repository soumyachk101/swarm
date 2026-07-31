"use client";

import { useEffect, useState } from "react";
import { X, Server, Puzzle } from "lucide-react";
import ProvidersSection from "./ProvidersSection";
import ModelsSection from "./ModelsSection";

interface SettingsPageProps {
  onClose: () => void;
}

// Only sections that are actually implemented get a nav entry — a nav item that
// opens a "coming soon" panel is a dead end.
type SectionId = "models" | "providers";

interface NavItem {
  id: SectionId;
  label: string;
  icon: typeof Server;
}

const NAV_ITEMS: NavItem[] = [
  { id: "models", label: "Models", icon: Server },
  { id: "providers", label: "Providers", icon: Puzzle },
];

export default function SettingsPage({ onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("models");

  // The backdrop closes it; Escape has to as well, or a keyboard user is stuck
  // in a full-screen modal with only the × as a way out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const renderSection = () => {
    switch (activeSection) {
      case "providers":
        return <ProvidersSection />;
      case "models":
      default:
        return <ModelsSection />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        // max-h rather than a fixed 80vh: on a short window the fixed height
        // still measured 80% of a viewport the dialog had already outgrown, so
        // the nav and the panel both ran under the bottom edge.
        className="flex h-[80vh] max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl glass-hi animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-swarm-border/50 flex-shrink-0">
          <span className="text-sm font-semibold text-swarm-text">Settings</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-2.5 py-1 rounded-lg text-micro bg-swarm-gold/10 border border-swarm-gold/20 text-swarm-goldHi hover:bg-swarm-gold/20 transition-colors"
              title="Reload the app window"
            >
              Reload
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-swarm-border/60 text-swarm-textMuted hover:text-swarm-text transition-colors ml-2"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <nav className="w-[220px] flex-shrink-0 border-r border-swarm-border/50 overflow-y-auto p-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors text-left ${
                    activeSection === item.id
                      ? "bg-swarm-gold/10 text-swarm-goldHi border border-swarm-gold/20"
                      : "text-swarm-textDim hover:text-swarm-text hover:bg-swarm-border/40"
                  }`}
                >
                  <Icon size={14} className="flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* min-w-0: the sections hold long model ids and base URLs, and
              without it a wide child stretched the flex item instead of
              scrolling, pushing the nav off the left of the dialog. */}
          <div className="min-w-0 flex-1 overflow-y-auto scrollbar-sleek p-5">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
