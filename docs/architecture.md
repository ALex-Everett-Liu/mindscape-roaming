# Mindscape Outliner — Architecture

This document describes the technical architecture of Mindscape Outliner, a WorkFlowy-like desktop outliner built with **Electrobun** and **SQLite**.

---

## Overview

| Aspect | Technology |
|--------|------------|
| **Runtime** | Bun (via Electrobun) |
| **Desktop shell** | Electrobun (native window + BrowserView) |
| **Frontend** | Preact + HTM |
| **Storage** | SQLite (local file: `outliner.db`) |
| **Data path** | `./data/` (dev) or `ELECTROBUN_APP_DATA` |

The app follows a **plugin-centric** design: core features (node operations, FTS search, settings) are implemented as main-process plugins. The app shell is minimal and coordinates plugin loading and RPC.

---

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electrobun Process                           │
│                                                                     │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐
│  │       MAIN (Bun)             │    │    RENDERER (BrowserView)   │
│  │                              │    │                              │
│  │  • PluginManager             │◄──►│  • Preact UI                 │
│  │  • Database (SQLite)         │ RPC │  • Store (state)             │
│  │  • Plugins:                  │    │  • Components                │
│  │    - core-node-ops           │    │    - App, OutlineTree        │
│  │    - core-fts-search         │    │    - Toolbar, Breadcrumb     │
│  │    - core-settings           │    │                              │
│  └─────────────────────────────┘    └─────────────────────────────┘
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- **Main process**: Bun process. Owns the database, plugin lifecycle, and RPC handlers.
- **Renderer process**: BrowserView (Chromium-based webview). Renders the UI, holds client state, and invokes main via RPC.

---

## Project Structure

```
src/
├── main/                        # Bun main process
│   ├── index.ts                 # Bootstrap: DB, PluginManager, RPC, window
│   ├── database/
│   │   ├── connection.ts        # SQLite connection (WAL, foreign_keys)
│   │   ├── migrations.ts        # Core migrations (outline_nodes, FTS)
│   │   └── seed.ts
│   ├── plugin-system/
│   │   ├── PluginManager.ts     # Load, enable/disable, dependency resolve
│   │   ├── PluginContext.ts    # API exposed to plugins (db, events, RPC)
│   │   ├── PluginManifest.ts   # Manifest types
│   │   ├── RpcHandlerRegistry.ts
│   │   ├── EventBus.ts         # Cross-plugin events
│   │   └── DependencyResolver.ts
│   ├── plugins/                 # Built-in main plugins
│   │   ├── core-node-ops/       # CRUD, tree queries (essential)
│   │   ├── core-fts-search/     # FTS5 search
│   │   └── core-settings/       # Plugin enable/disable
│   └── skeletons/
│       └── loadPlugins.ts       # Skeleton-aware plugin loader
│
├── renderer/                    # BrowserView frontend
│   ├── index.ts                 # Electroview init, App render
│   ├── rpc/
│   │   └── api.ts               # Typed RPC client wrapper
│   ├── state/
│   │   ├── store.ts             # Central app state + save/discard
│   │   └── saveStateManager.ts   # Multi-source save coordination
│   ├── components/
│   │   ├── App.ts
│   │   ├── OutlineTree.ts, OutlineNode.ts
│   │   ├── NodeEditor.ts
│   │   ├── Toolbar.ts, Breadcrumb.ts
│   │   └── PluginSettingsView.ts
│   └── styles/
│       └── main.css
│
└── shared/
    ├── types.ts                 # OutlineNode, OutlineTreeNode, RPC params
    └── rpc-schema.ts            # Typed RPC interface
```

---

## Plugin System

### Design

- **Main-process only**: Plugins run in the Bun process and register RPC handlers.
- **Skeleton profiles**: `skeletons.config.ts` defines which plugins ship in `minimal`, `standard`, and `full` builds. Use `SKELETON=minimal bun run build` for a slimmer build.
- **Dependency resolution**: `DependencyResolver` topologically sorts plugins so dependencies load first.
- **Registration**: Each plugin implements `MainPlugin` with `manifest` and `onLoad(ctx)`. The context provides:
  - `getDatabase()` — SQLite
  - `runMigration()` — schema migrations
  - `registerRpcHandler()` — expose RPC to renderer
  - `eventBus` — subscribe/emit events

### Built-in Plugins

| Plugin | Purpose |
|--------|---------|
| **core-node-ops** | Node CRUD, tree queries, migrations. Essential. |
| **core-fts-search** | FTS5 full-text search. Registers `search` RPC. |
| **core-settings** | Plugin list, enable/disable. Registers `listPlugins`, `enablePlugin`, `disablePlugin`. |

### Plugin Flow

```
Main startup
  → getDatabase(), runMigrations()
  → PluginManager constructed
  → loadMainPlugins() (skeleton-aware)
  → pluginManager.register() for each
  → pluginManager.loadAll() — resolves deps, calls onLoad
  → buildRpcHandlers() → BrowserView.defineRPC()
```

---

## Data Layer

### Database

- **Engine**: `bun:sqlite` with WAL mode.
- **Path**: `./data/outliner.db` (dev) or `{ELECTROBUN_APP_DATA}/outliner.db`.

### Schema

- **`outline_nodes`**: `id`, `content`, `parent_id`, `position`, `is_expanded`, `is_deleted`, `created_at`, `updated_at`
- **`outline_nodes_fts`**: FTS5 virtual table for content search (sync via triggers)
- **`_plugin_state`**: Plugin enable/disable state
- **`_migrations`**: Applied migration versions

### Migrations

- Core migrations in `database/migrations.ts` (outline_nodes, metadata, soft-delete, FTS).
- Plugins can run additional migrations via `ctx.runMigration()` (e.g. `core-node-ops` creates `outline_nodes` if missing).

---

## RPC (Main ↔ Renderer)

The renderer invokes main-process methods via Electrobun's typed RPC.

### Schema

Defined in `shared/rpc-schema.ts` as `OutlinerRPCType`. Main handlers are built in `PluginManager.buildRpcHandlers()` from plugin registrations.

### Key Methods

| Method | Purpose |
|--------|---------|
| `getSubtree`, `getNode`, `getAncestors` | Load tree / zoom |
| `createNode`, `updateNode`, `deleteNode` | Node CRUD |
| `moveNode`, `indentNode`, `outdentNode` | Tree structure |
| `search` | FTS search |
| `listPlugins`, `enablePlugin`, `disablePlugin` | Plugin management |
| `reportUnsavedState` | Tell main there are unsaved changes (for quit warning) |

---

## State & Save Mechanism

### Renderer State

- **Store** (`store.ts`): Single central store. Holds tree, zoom, breadcrumbs, search, focus, loading, unsaved count.
- **Subscribe/update**: Components subscribe via `store.subscribe()` and call `store.method()` for actions.

### Manual Save

- **All edits** are **manual save only**: content, expand/collapse, create, move, indent, outdent, and delete update in-memory state; persistence happens only when the user clicks Save (or Ctrl+S). The database file remains unchanged until the user explicitly approves.
- ** Structural ops** (create, delete, indent, outdent, move) persist immediately.
- **SaveStateManager** (`saveStateManager.ts`): Registers sources (e.g. `"outliner"`) with `getChanges`, `save`, `discard`. Used for Save All, Discard All, and quit-warning coordination.

### Quit Warning

Main process listens to `reportUnsavedState`. On `before-quit`, if there are unsaved changes, a dialog asks the user to confirm or cancel.

---

## UI Structure

- **App**: Root layout. Renders Toolbar, Breadcrumb (if zoomed), search results or OutlineTree, PluginSettingsView modal.
- **OutlineTree / OutlineNode**: Recursive tree rendering. Nodes use `NodeEditor` (contenteditable) for inline editing.
- **Toolbar**: Search, settings, save/discard buttons (when unsaved).
- **Breadcrumb**: Navigation path when zoomed into a node.

---

## Skeletons

| Skeleton | Plugins Included |
|----------|-------------------|
| **minimal** | core-node-ops, core-tree-view, core-editor, core-theme, core-settings |
| **standard** | minimal + core-keyboard, core-toolbar, core-search, core-undo-redo |
| **full** | standard + core-fts-search, core-drag-drop, core-breadcrumb, core-zoom, core-context-menu |

*Note: The renderer currently uses monolithic components rather than plugin-injected slots. The skeleton config primarily affects which *main* plugins are bundled (`core-node-ops`, `core-fts-search`, `core-settings`).*

---

## Event Bus

Plugins can emit and subscribe to events via `EventBus` (e.g. `NODE_CREATED`, `TREE_LOADED`, `APP_READY`). Used for cross-plugin coordination without direct coupling.

---

## References

- **architecture-framework-design.md** — Detailed design document for the plugin system (aspirational; some parts not yet implemented).
- **SAVE_MECHANISM_ANALYSIS.md** — Analysis of save patterns (references Luhmann-Roam; concepts apply here).
- **PLUGIN_SYSTEM_ANALYSIS.md** — Plugin loading and startup considerations (references Luhmann-Roam).
