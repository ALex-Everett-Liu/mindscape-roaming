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
- **Vim-style keyboard navigation** — Jump to any node without the mouse. [User Guide →](docs/vim-nav-user-guide.md)
- **Drag & drop** — Reorder and nest nodes
- **SQLite storage** — Data saved in stable app data dir (e.g. `%LOCALAPPDATA%\sh.blackboard.outliner\dev\` on Windows). Override with `ELECTROBUN_APP_DATA` for dev.
- **Manual save mode** — Edits write directly to DB; backup created on first edit. Save commits; Discard restores from backup. `Ctrl+S` to save.

## Getting Around

Three UI surfaces tie the whole app together — learn these first.

### Command Palette (`Ctrl+P`)

Press `Ctrl+P` to open a searchable list of everything you can do. Type to filter, then `Enter` to run. It covers:

- All registered commands (create node, export, toggle sidebar, etc.)
- Keyboard shortcut display for each command
- Recently used commands appear at the top
- Works as a launcher — you never need to memorize shortcuts

### Context Menu (Right-Click)

Right-click any bullet (`•`) to see actions relevant to that node:

- Copy block reference as `((id))`
- Create links, pin bookmarks, open image galleries
- Other plugins add items here — the menu grows with your setup

### Sidebar (Toggle from Command Palette)

The right sidebar hosts multiple **tabs**:

| Tab | Source plugin | Shows |
|-----|---------------|-------|
| ★ Bookmarks | Core: Bookmarks | Nodes you've pinned for quick access |
| Workspace | Core: Workspace | Temporary pins — clears on restart |
| Links | Node Links | Incoming/outgoing links for the focused node |

Open it via `Ctrl+P` → "Toggle Sidebar", or resize by dragging its left edge.

## Plugins

All features are implemented as plugins. Enable or disable each in **Settings → Plugins**.

### System (always enabled)

| Plugin | Description |
|--------|-------------|
| **Core: Node Operations** | Outline CRUD, tree queries, data model — the backbone of the app |
| **Core: Settings** | Plugin management, app preferences, import/export settings |

### Editing

| Plugin | Type | Default | Description |
|--------|------|---------|-------------|
| **Core: Keyboard Shortcuts** | core | on | Enter, Tab, Backspace, arrow keys for outliner operations |
| **Core: Drag & Drop** | core | on | Drag a node onto another to reparent it |

### Search & Navigation

| Plugin | Type | Default | Description |
|--------|------|---------|-------------|
| **Core: Full-Text Search** | core | on | FTS5 search across all nodes |
| **Vim Navigation** | community | off | `Alt+V` for Vim-style hint-based keyboard navigation. [Guide →](docs/vim-nav-user-guide.md) |

### Content Features

| Plugin | Type | Default | Description |
|--------|------|---------|-------------|
| **Core: Bookmarks** | core | on | Pin nodes as bookmarks in the sidebar |
| **Core: Workspace** | core | on | Temporary pin workspace — clears on restart |
| **Block References** | community | on | `((block-id))` syntax for cross-references with hover preview |
| **Node Links** | community | off | Directed, weighted links between nodes with a sidebar manager |
| **Page Mode** | community | off | `[[wikilink]]` page system — turn blocks into pages |

### Media

| Plugin | Type | Default | Description |
|--------|------|---------|-------------|
| **Core: Image Viewer** | core | on | Inline `![](path)` image rendering with fullscreen zoom |
| **Image Gallery** | community | off | Browse all images under a node with arrow key navigation |

### Export

| Plugin | Type | Default | Description |
|--------|------|---------|-------------|
| **Core: Export** | core | on | Export outline as JSON, Markdown, OPML, plain text, or HTML |

## Project Structure

```
src/
├── main/                    # Bun main process (backend)
│   ├── plugin-system/      # PluginManager, loadPlugins, EventBus, RPC
│   ├── plugins/            # Built-in plugins (core-node-ops, core-fts-search, core-settings)
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
- **Settings**: All built-in plugins appear in Settings; users enable/disable each.
- **Main process**: PluginManager loads enabled plugins in dependency order; RPC handlers are registered by plugins.
- **Renderer**: Preact UI, local state, RPC client to main process.
