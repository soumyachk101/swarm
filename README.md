# Swarm

> Project intelligence lives in the project, not in a chat session.

Swarm is a local-first, AI-native desktop dev environment. Run any CLI coding agent in a terminal pane; every agent reads and writes **one shared, project-scoped memory store**, so switching tools never loses context. Hand a goal to Lead and a team of agents builds it in parallel — each in its own git worktree, coordinated by file-ownership locks.

- **Shared memory (Pheromone)** — hybrid vector + keyword retrieval over `.pheromone/memory/*.md`, injected into every agent.
- **Agents** — launch Claude Code, Codex, OpenCode, Aider, and more in real PTY panes.
- **Lead** — conversational planner that breaks a goal into tasks and dispatches agents via tool-calling.
- **Plane workspace** — one surface at a time: Agents, Terminal, Browser, CoWorkers, or Android Emulator.
- **Browser + Emulator panes** — CDP localhost preview with agent-readable screenshots; build/boot Android AVDs.
- **Local voice** — whisper.cpp dictation, no API key, with in-app push-to-talk hotkeys.

## 📑 Table of Contents

- [🚀 How to Use](#-how-to-use)
- [🧠 Implementation Overview](#-implementation-overview)
- [🛠️ Tech Stack](#️-tech-stack)
- [⚙️ Setup & Installation](#️-setup--installation)
- [📁 Project Structure](#-project-structure)
- [📦 Exports](#-exports)
- [⬇️ Downloads](#️-downloads)
- [📄 License](#-license)

## 🚀 How to Use

- **Open a project** — a `.pheromone/` memory store is created (or reused) in the folder. Pheromone MCP (`pheromone_query`) is auto-registered into every MCP-capable Agent CLI config (Claude `.mcp.json`, OpenCode, Codex, …) and pre-approved in Claude `settings.local.json`. Paths are normalized for Windows (no `\\?\` / `//?/` prefixes, which break Node). Claude workspace trust is pre-written to `~/.claude.json`. Files you open in Explorer/Search/Git are tracked for Pheromone retrieval hints. Pick a **theme** from the title-bar palette (Swarm default, Claude, Neon, Midnight, Forest, Rose, Slate, Dracula) — it recolors the full UI (chrome, panes, boards, terminals), not just the canvas.
- **Pick a plane** from the title bar, then use its `+` to add panes: launch a CLI agent (Agents), a shell (Terminal), a CDP browser, or an Android emulator. Agents resolve CLIs from `%APPDATA%\npm` (and native package bins like `opencode-ai/bin/opencode.exe`) even when the GUI process PATH is incomplete, and spawn with permission-bypass flags. MCP-capable CLIs get a local Pheromone marker only — handoff transcripts are never pasted into the CLI prompt.
- **Dispatch with Lead** — describe a goal in the right dock; Steward breaks it into tasks with declared file ownership, creates a git worktree per builder, launches an agent in each, and tracks them on the Tasks board.
- **Preview & test** — the Browser pane loads your localhost dev server; Lead can screenshot it. The Emulator pane builds an immutable AVD (device, RAM, storage) and boots it.
- **Voice** — click the mic in Lead to dictate; or push-to-talk: hold **Ctrl+Win** to type into the focused field, **Win+Alt** to dictate into Lead.

## 🧠 Implementation Overview

Each root folder is a standalone package that owns its domain; **Swarm borrows, never re-implements**. Side effects that a browser can't do (git, fs, PTY) go through typed ports, with Tauri-backed adapters supplied by Swarm.

```mermaid
flowchart LR
    U[User] --> UI[React UI]
    UI -->|invoke| RS[Rust Backend]
    RS --> PTY[portable-pty] --> AG[CLI Agent Pane]
    AG -->|MCP pheromone_query| NEC[(pheromone.db + memory/*.md)]
    RS --> NEC
    UI --> QB[Lead dock]
    QB -->|dispatch_goal| DP[dispatch.ts]
    DP --> ORCH[SwarmMind Orchestrator]
    ORCH -->|create_worktree| RS
    ORCH --> AG
```

- **Hybrid retrieval** — query is embedded as a deterministic 384-dim char n-gram (identical in Rust and JS), fused with SQLite FTS via Reciprocal Rank Fusion, then token-budget capped. See [`Pheromone/src/search`](Pheromone/src/search).
- **Orchestration** — `SwarmMind.Orchestrator` runs file-ownership lock checks before dispatch and merges branches on approve. Pure core stays free of `node:` imports (enforced by a test); Swarm injects adapters in [`swarmmindAdapters.ts`](Swarm/src/features/orchestration/swarmmindAdapters.ts).

```mermaid
graph LR
    G[Goal] --> BD[Lead.breakdown]
    BD --> PL[plan: lock check]
    PL -->|ok| WT[git worktree] --> SWARM[Agent]
    PL -->|conflict| BLK[blocked card]
    SWARM --> RV[review] --> MG[merge + release locks]
```

- **Pure card + AVD logic** — board ordering ([`Tasks/src/cards.ts`](Tasks/src/cards.ts)) and Android `config.ini` generation ([`Swarm/src/features/emulator/android/avd.ts`](Swarm/src/features/emulator/android/avd.ts)) are pure and unit-tested.

## 🛠️ Tech Stack

| Category | Technology | Purpose |
| --- | --- | --- |
| Desktop shell | Tauri v2 (Rust) | native window, IPC, process/filesystem access |
| Frontend | React + Vite + TailwindCSS + Zustand | UI, panes, state |
| Terminal | `xterm.js` + `portable-pty` | agent & shell panes over a PTY |
| Memory store | SQLite (`rusqlite` / `sql.js`) + FTS5 | Pheromone hybrid retrieval |
| Agent bridge | Model Context Protocol (stdio) | exposes `pheromone_query` to CLIs |
| Orchestration | `@swarm/mind` | git worktrees, file locks, dispatch/approve |
| Browser pane | Chrome DevTools Protocol | localhost preview + screenshots |
| Emulator | Android SDK (`emulator` / `adb`) | build + boot AVDs |
| Voice | whisper.cpp + WebAudio | local, offline dictation |
| Monorepo | `pnpm` workspaces + Turborepo | TypeScript + Rust |
| Tests | Vitest | per-package unit tests |

## ⚙️ Setup & Installation

**Prerequisites**

- Node.js ≥ 20
- pnpm ≥ 9 (`npm i -g pnpm`)
- Rust (stable) + Cargo — https://rustup.rs
- [Tauri v2 system dependencies](https://tauri.app/start/prerequisites) for your OS
- At least one CLI coding agent on PATH (e.g. `npm i -g @anthropic-ai/claude-code`)
- Optional: Android SDK (`emulator` + `platform-tools`) for the Emulator plane

Provider API keys are entered in the in-app Settings panel and stored locally — there are no `.env` files.

**Install & run**

```bash
pnpm install
pnpm turbo build
cd Swarm && pnpm tauri:dev
```

**Build installers**

```bash
cd Swarm && pnpm tauri:build
```

## 📁 Project Structure

```text
Swarm/
├── Swarm/                     # Tauri desktop app
│   ├── src/
│   │   ├── app/              # HomePage shell (title bar, planes, docks)
│   │   ├── features/         # one folder per feature (owns UI + store + tests)
│   │   │   ├── panes/        # plane host + switcher
│   │   │   ├── agents/  # CLI agent panes
│   │   │   ├── terminal/     # shell panes (xterm)
│   │   │   ├── browser/      # CDP browser pane
│   │   │   ├── emulator/     # Android AVD build + panes
│   │   │   ├── lead/     # planner chat + tools
│   │   │   ├── orchestration/# dispatch + SwarmMind adapters
│   │   │   ├── tasks/    # mission board
│   │   │   ├── voice/        # whisper dictation + hotkeys
│   │   │   ├── memory/ · sessions/ · settings/ · workspaces/ · dock/
│   │   └── shared/           # cross-feature: tauri, stores, logo
│   └── src-tauri/            # Rust: PTY, fs, git/worktree, CDP, emulator, whisper
├── Pheromone/                   # memory: DB, retrieval, injection
│   └── pheromone-mcp/           # MCP stdio server (pheromone_query)
├── SwarmMind/                 # orchestration engine (registry, locks, worktrees)
├── Lead/                 # planning: breakdown, assignment, review routing
├── Tasks/                 # board/pipeline state + React UI
├── Agents/               # per-CLI adapters + launcher
├── Voice/                 # local voice layer (whisper.cpp, injectable ports)
├── landing-page/             # Next.js marketing site (topo/aurora hero)
├── pnpm-workspace.yaml
└── turbo.json
```

## 📦 Exports

Consumed by Swarm via `workspace:*`. Each ships a pure entry; Node-only engines sit behind a `/core` subpath where noted.

| Package | Key exports |
| --- | --- |
| `@swarm/pheromone` | `Pheromone`, `SearchEngine`, `InjectionPipeline` |
| `@swarm/pheromone-mcp` | `buildCliConfig`, `runPheromoneQuery`, `PHEROMONE_QUERY_TOOL` |
| `@swarm/mind` (`/core`) | `Orchestrator`, `AgentRegistry`, `LockRegistry`, `RoleManager`, `WorktreeOps` |
| `@swarm/lead` | `breakdown`, `DefaultAssignmentStrategy`, `ReviewRouter`, `MODE_SYSTEM_PROMPTS`, `TOOLS`/`executeTool` (conversational tool surface) |
| `@swarm/tasks` | `Board`, `addCard`/`moveCard`, `PipelineBoard`, `buildPipeline` |
| `@swarm/agents` | `AgentLauncher`, `CLI_METADATA`, `buildCliConfig`, `withPermissionBypass` |
| `@swarm/voice` (`/core`) | `Voice`, `STTEngine`, `AudioRecorder`, `WhisperCppEngine` |

## ⬇️ Downloads

No prebuilt binaries are published. `cd Swarm && pnpm tauri:build` produces Windows installers under `Swarm/src-tauri/target/release/bundle/`:

| Installer | Path |
| --- | --- |
| NSIS setup | `nsis/Swarm AI_<version>_x64-setup.exe` |
| MSI | `msi/Swarm AI_<version>_x64_en-US.msi` |

## 📄 License

Personal, non-commercial use only — see [LICENSE](LICENSE). Commercial use is not permitted; contact raktimyoddha07@gmail.com for a commercial license.
