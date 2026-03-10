# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2025-03-10

### Added

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

## [0.1.3] - 2025-03-10

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

[Unreleased]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ALex-Everett-Liu/mindscape-roaming/releases/tag/v0.1.0
