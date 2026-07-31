"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Terminal, File, Settings } from "lucide-react";

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onToggleterminal: () => void;
  onToggleSidebar: () => void;
  onOpenFile: () => void;
  onOpenSettings: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onToggleterminal,
  onToggleSidebar,
  onOpenFile,
  onOpenSettings,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Whatever had focus when the palette opened, so closing puts it back. */
  const restoreRef = useRef<HTMLElement | null>(null);

  const commands: Command[] = [
    {
      id: "toggle-terminal",
      label: "Toggle terminal",
      icon: <Terminal size={16} />,
      shortcut: "Ctrl+`",
      action: () => {
        onToggleterminal();
        onClose();
      },
    },
    {
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      icon: <File size={16} />,
      shortcut: "Ctrl+B",
      action: () => {
        onToggleSidebar();
        onClose();
      },
    },
    {
      id: "open-file",
      label: "Open File",
      icon: <File size={16} />,
      shortcut: "Ctrl+O",
      action: () => {
        onOpenFile();
        onClose();
      },
    },
    {
      id: "open-settings",
      label: "Open Settings",
      icon: <Settings size={16} />,
      shortcut: "Ctrl+,",
      action: () => {
        onOpenSettings();
        onClose();
      },
    },
  ];

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()),
  );

  // Opening steals focus from a terminal or an editor. Remembering the previous
  // element and handing focus back on close means Ctrl+K → Esc leaves the user
  // typing exactly where they were, instead of on the document body.
  useEffect(() => {
    if (!isOpen) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      setQuery("");
      setSelectedIndex(0);
      restoreRef.current?.focus();
      restoreRef.current = null;
    };
  }, [isOpen]);

  // Typing shortens the list under the cursor. Without this the highlight kept
  // an index past the end and Enter silently did nothing.
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Keep the highlighted row visible once the list is long enough to scroll —
  // arrowing past the fold otherwise moves an invisible selection.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Every branch below indexes the filtered list; with no matches the
      // modulo arithmetic yielded NaN and wedged the highlight permanently.
      const n = filteredCommands.length;
      if (n === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % n);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + n) % n);
      } else if (e.key === "Enter") {
        e.preventDefault();
        filteredCommands[selectedIndex]?.action();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 z-50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="mx-4 w-full max-w-xl glass-hi rounded-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center px-4 py-3 border-b border-swarm-border/50">
          <Search size={18} className="text-swarm-gold mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-swarm-text placeholder-swarm-textMuted outline-none text-sm"
          />
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-96 overflow-y-auto scrollbar-sleek p-1.5">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-swarm-textMuted">
              No commands match “{query}”
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                data-selected={index === selectedIndex}
                onClick={cmd.action}
                // Hovering moves the highlight instead of adding a second one:
                // a mouse-hover tint alongside the keyboard row made it
                // ambiguous which row Enter would actually run.
                onMouseMove={() => setSelectedIndex(index)}
                className={`w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
                  index === selectedIndex
                    ? "bg-swarm-gold/15 text-swarm-goldHi"
                    : "text-swarm-textDim"
                }`}
              >
                <span className={`mr-3 ${index === selectedIndex ? "text-swarm-gold" : "text-swarm-textMuted"}`}>
                  {cmd.icon}
                </span>
                <span className="flex-1 text-left">{cmd.label}</span>
                {cmd.shortcut && (
                  <span className="text-mini text-swarm-textMuted bg-swarm-border/50 px-2 py-0.5 rounded-md">
                    {cmd.shortcut}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-swarm-border/50 text-mini text-swarm-textMuted flex justify-between">
          <span>
            <span className="mr-4">↑↓ Navigate</span>
            <span className="mr-4">Enter Select</span>
            <span>Esc Close</span>
          </span>
        </div>
      </div>
    </div>
  );
}
