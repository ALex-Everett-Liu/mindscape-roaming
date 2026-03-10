# Mindscape Outliner

A WorkFlowy-like desktop outliner app built with [Electrobun](https://github.com/blackboardsh/electrobun) and SQLite. Your data is stored locally in a SQLite database.

## Prerequisites

- **[Bun](https://bun.sh/)** — Electrobun uses Bun as its runtime. Install Bun:
  ```bash
  # Windows (PowerShell)
  powershell -c "irm bun.sh/install.ps1 | iex"

  # macOS/Linux
  curl -fsSL https://bun.sh/install | bash
  ```

## Getting Started

```bash
# Install dependencies
bun install

# Build and run the app
bun start
```

This will build the app and launch it in development mode.

## Build for Distribution

```bash
bun run build
```

## Features

- **Hierarchical outlines** — Create nested bullet points with unlimited depth
- **Zoom** — Click a bullet with children to zoom into that section
- **Breadcrumb navigation** — Navigate back up the hierarchy
- **Search** — Full-text search across all nodes (FTS5)
- **Keyboard shortcuts**:
  - `Enter` — Create new sibling
  - `Tab` / `Shift+Tab` — Indent / Outdent
  - `Backspace` (on empty) — Delete node
  - `Alt+↑` / `Alt+↓` — Move node up/down
- **Drag & drop** — Reorder and nest nodes
- **SQLite storage** — Data saved in `./data/outliner.db` (or `ELECTROBUN_APP_DATA`)

## Project Structure

```
src/
├── main/                    # Bun main process (backend)
│   ├── plugin-system/      # PluginManager, EventBus, RPC registry
│   ├── plugins/            # Built-in plugins (core-node-ops, core-fts-search, core-settings)
│   ├── skeletons/          # Skeleton-aware plugin loader
│   ├── database/           # SQLite connection
│   └── rpc/                # RPC types
├── renderer/               # BrowserView frontend (Preact + HTM)
│   ├── components/         # UI components
│   ├── state/              # Client state store
│   ├── rpc/                # RPC client
│   └── styles/             # CSS
└── shared/                 # Types shared between main and renderer
```

## Architecture

The app follows the design from `architecture-framework-design.md`:

- **Plugin system**: Core features (node ops, FTS search) are implemented as plugins. The app shell is minimal.
- **Skeletons**: `skeletons.config.ts` defines profiles (minimal, standard, full). Use `SKELETON=minimal bun run build` for a slimmer build.
- **Main process**: PluginManager loads plugins in dependency order; RPC handlers are registered by plugins.
- **Renderer**: Preact UI, local state, RPC client to main process.
