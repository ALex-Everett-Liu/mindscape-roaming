# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.7] - 2025-03-12

### Added

- **Theme system**: Switch between multiple visual themes via Settings → Theme tab
  - **Native** (default): Simple dark theme with native system styling
  - **Light**: Clean, minimal light theme
  - **Organic**: Warm, natural theme with earth-drawn palette (Nunito font)
  - **Ocean**: Cool oceanic blue tones
  - **Forest**: Deep green, nature-inspired palette
- Theme preference persisted in localStorage; applies immediately on selection
- Tabbed Settings modal: Plugins and Theme tabs

## [0.1.6] - 2025-03-12

### Added

- **core-drag-drop plugin**: Renderer plugin for drag-and-drop reparenting
  - Drag a node onto another to make it the first child (reparent only)
  - Reordering uses keyboard shortcuts (Alt+Shift+Up/Down)
  - Cycle prevention (cannot drop onto a descendant)
  - Enable/disable in Plugin Settings
- **loadRendererPlugins**: Unified loader for core-keyboard and core-drag-drop; shared EventBus and action bridge
- **action:moveNodeTo**: Action bridge handler for plugin-emitted reparent operations
- **core-keyboard plugin**: Renderer plugin providing standard keyboard shortcuts for outliner operations
  - Enter — Create new sibling after current node
  - Tab / Shift+Tab — Indent / Outdent
  - Backspace — Delete node when content is empty
  - Alt+↑ / Alt+↓ — Focus previous/next node
  - Alt+Shift+↑ / Alt+Shift+↓ — Move node up/down among siblings
  - Escape — Blur node editor
  - Ctrl+Enter — Create new root node (in current zoom context)
  - Ctrl+F — Focus search input
- **Renderer plugin system**: EventBus, CommandRegistry, RendererPluginContext, action bridge for plugin-to-store communication
- **Store**: `focusPrevious(id)` and `focusNext(id)` for depth-first navigation
- **CoreEvents.SEARCH_OPENED**: Event for search-focus shortcut
- core-keyboard appears in Plugin Settings (main-process stub for enable/disable)

### Changed

- **Drag-and-drop fully plugin-controlled**: Removed native drag handlers from OutlineNode; core-drag-drop uses event delegation on tree container
- **OutlineNode**: Uses `data-node-id` and `dragDropEnabled` from plugin state; draggable only when plugin enabled
- **main.css**: Drag-drop styles moved into core-drag-drop plugin (injected when enabled)
- Moved keyboard handling from OutlineNode/NodeEditor into core-keyboard plugin (document-level keydown)
- Toolbar listens for `focus-search` custom event to focus search input on Ctrl+F

### Removed

- Native `handleDragStart`, `handleDragOver`, `handleDrop` from OutlineNode
- Standalone `loadKeyboardPlugin.ts` (replaced by `loadRendererPlugins.ts`)

### Fixed

- **core-keyboard disable had no effect**: Disabling the plugin now actually unloads it—shortcuts stop working. Sync on Settings close; load only when enabled.

## [0.1.5] - 2025-03-11

### Added

- **docs/milestones.md**: Completed features (FTS5 search plugin improvements)
- **docs/roadmap.md**: Future plans for soft-delete features (undo/redo, trash, hard-delete cleanup)
- **FTS5 search UI when disabled**: Search input disabled with placeholder when `core-fts-search` plugin is not loaded; `searchAvailable` refreshed on app init and when Settings closes

### Changed

- **Plugin system**: Removed skeleton concept entirely. All built-in plugins are registered at startup; users enable/disable each in Settings. Moved `loadPlugins.ts` to `plugin-system/`; deleted `skeletons.config.ts` and `skeletons/` folder.
- **docs**: Restructured roadmap and backlog
  - Split into `roadmap.md` (strategic) and `feature-backlog.md` (tactical implementation specs)
  - One roadmap, one backlog — each with multiple initiatives (Save Mechanism, Soft Delete)

### Fixed

- **FTS5 search returning 0 results**: Rebuild on first enable now uses `outline_nodes_fts_docsize` (token index) instead of FTS row count—external content tables report content rows even when the index is empty. Prefix query with exact-token fallback.

## [0.1.4] - 2025-03-10

### Added

- **docs**: Save mechanism documentation
  - `SAVE_MECHANISM_SPEC.md` — Technical spec for expert review (failure modes, assumptions)
  - `An expert review to SAVE_MECHANISM_SPEC.md` — Expert analysis and actionable recommendations
  - `roadmap.md` — Future improvement roadmap (atomic ops, Backup API refactor, crash recovery)
- **Backup-on-edit**: DB backup created on first edit; Discard restores from backup
  - All operations write directly to `outliner.db`
  - Lightweight tracking: `Set<nodeId>` for UI (Save/Discard buttons, amber borders, close warning)
  - Save = delete backup (commit). Discard = overwrite db with backup, reload
  - `ensureBackup`, `restoreFromBackup`, `commitSave` in DB layer; plugin reload after restore
- Debug logging for Discard flow (renderer + main)

### Changed

- Simplified save mechanism: removed in-memory change tracking, treeUtils, path-copying
- Reverted to direct API writes for create, move, indent, outdent, delete, content, expand
- **SQLite journal mode**: WAL → TRUNCATE (single file only; avoids EBUSY on Windows Discard)

### Fixed

- **Discard not working**: Restore now reliably updates UI
  - Unload plugins before DB close to release refs
  - TRUNCATE mode eliminates -wal/-shm file locks on Windows
  - Force full tree reload (clear + loading state) after restore
  - Increased RPC timeouts for Discard (renderer 15s, main 10s)
  - Proper error handling; clears "Discarding..." state on failure
- **Data loss on restart**: Database now uses `Utils.paths.userData` instead of `process.cwd()` — stable path across runs. Previously, `electrobun dev` ran from build output dir, creating a new empty DB on each restart.
- **Outline tree spacing**: Reduced excessive vertical padding; nested trees use minimal padding to eliminate large gaps between root-level siblings.

## [0.1.3] - 2025-03-10 - 2025-03-10

### Fixed

- **Enter → Loading forever**: No longer show full-screen Loading when refreshing after user actions (create, indent, outdent, zoom, etc.); only show Loading on initial app load
- **Load hangs**: Breadcrumbs fetch moved to background so it never blocks the loading state; added load version guard for concurrent loads
- **Contenteditable duplication**: Typing in a node no longer doubles text (e.g. "aaa" → "aaaaaa"); sync from props only when switching nodes or when blurred, never while focused
- **Database path**: Use project `./data/` by default; override with `ELECTROBUN_APP_DATA` if set

## [0.1.2] - 2025-03-10

### Added

- **Manual save mode**: All edits write to DB immediately; backup + lightweight tracking for Save/Discard
  - Save / Discard buttons in toolbar (shown only when there are unsaved changes)
  - `Ctrl+S` / `Cmd+S` to save
  - Visual indicator (amber border) on edited nodes
  - Success and error feedback after save
- **Close warning**: App prompts "Quit anyway?" when closing with unsaved changes
- **SaveStateManager**: Shared module for future plugins to register their own save sources
- Error handling for failed saves (alert + no clear of unsaved state)

### Changed

- Removed auto-save: no operations persist until explicit Save
- Use `Bun.randomUUIDv7()` instead of Node `crypto.randomUUID()` for node IDs
- Move `architecture-framework-design.md` to `docs/`

## [0.1.1] - 2025-03-10

### Added

- **Plugin system**: Main process now uses a plugin architecture (Obsidian-style)
  - `PluginManager`, `EventBus`, `RpcHandlerRegistry` for plugin lifecycle
  - Core plugins: `core-node-ops` (CRUD, tree), `core-fts-search` (FTS5), `core-settings`
- **App skeletons**: `skeletons.config.ts` defines minimal/standard/full profiles
  - Set `SKELETON=minimal` before build for a slimmer app (fewer plugins bundled)
  - Each skeleton determines which built-in plugins are loaded
- **Plugin settings panel**: Enable/disable plugins via gear icon in toolbar
  - Modal lists all plugins with toggle switches
  - Essential plugins (e.g. core-node-ops) cannot be disabled

### Fixed

- Database path: prefer `./data/outliner.db` when it exists (dev) or `ELECTROBUN_APP_DATA` env
- Plugin loading: use static imports instead of dynamic `import()` so bundler includes handlers
- Data migration: auto-copy from `outliner_nodes` table if `outline_nodes` is empty
- Enter key now creates first node when tree is empty (empty state is focusable)

## [0.1.0] - 2025-03-10

### Added

- Initial release of Mindscape Outliner
- WorkFlowy-like hierarchical outline with nested bullets and unlimited depth
- SQLite storage with WAL mode for persistent data
- FTS5 full-text search across all nodes
- Zoom-in: click a bullet with children to focus on that section
- Breadcrumb navigation to move back up the hierarchy
- Keyboard shortcuts:
  - `Enter` — Create new sibling after current node
  - `Tab` / `Shift+Tab` — Indent / Outdent
  - `Backspace` — Delete node when content is empty
  - `Alt+↑` / `Alt+↓` — Move node up/down among siblings
- Drag and drop for reordering and nesting nodes
- Expand/collapse toggle for nodes with children
- Dark theme UI with accent styling
- Electrobun desktop app (Bun backend + BrowserView frontend)
- Preact + HTM for the renderer UI
- RPC bridge for type-safe main/renderer communication

### Fixed

- Correct Electrobun import: use default import for `Electrobun`, not named export
- Use `Electrobun.Utils.quit()` instead of `Electrobun.quit()` on window close
- Fix database path: use `Electrobun.Utils.paths.userData` for writable app data directory
- Fix migration runner: run full migration SQL as single block to avoid breaking triggers with semicolons in `BEGIN...END`
- Fix loading screen hang: add RPC timeout (15s), error handling, and defer initial load to allow WebSocket connection

[Unreleased]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ALex-Everett-Liu/mindscape-roaming/releases/tag/v0.1.0
