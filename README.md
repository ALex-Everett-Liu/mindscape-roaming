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
├── main/           # Bun main process (backend)
│   ├── database/   # SQLite connection, migrations, seed
│   ├── repository/ # Data access layer
│   ├── services/   # Business logic
│   └── rpc/        # RPC types
├── renderer/       # BrowserView frontend (Preact + HTM)
│   ├── components/ # UI components
│   ├── state/      # Client state store
│   ├── rpc/        # RPC client
│   └── styles/     # CSS
└── shared/         # Types shared between main and renderer
```

## Architecture

The app follows the design from `architecture-framework-design.md`:

- **Main process** (Bun): SQLite database, migrations, repository, business logic, RPC handlers
- **Renderer** (BrowserView): Preact UI, local state, RPC client to main process
- **RPC bridge**: Electrobun RPC for type-safe communication between processes
