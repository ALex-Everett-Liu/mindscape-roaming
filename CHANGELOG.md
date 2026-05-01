# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.4] - 2026-05-02

### Added

- **Block-ref display mode toggle**: "Toggle Block Ref Display" command switches between showing `↪ ((uuid))` (UUID mode, default) and showing the actual referenced content with a dashed underline (Content mode). In content mode, the UUID is shown on hover. Preference persisted in `localStorage` (`mindscape_block_ref_display`)
- **Backlinks panel breadcrumb trails**: Each backlink item now shows the full ancestor path (e.g. `Root › Section › Subsection`) in muted text, so you can see where each referencing node lives in the outline
- **Backlinks panel ref resolution**: Backlink items now resolve `((uuid))` references in their content to show actual text instead of raw UUID strings, making the context of each backlink immediately readable
- **Page Ancestors panel**: When breadcrumb truncation is enabled inside a page, a bottom panel shows clickable ancestor nodes above the page boundary (e.g. `2 Ancestors above this page`), providing a way to navigate back out of the page scope

## [0.3.3] - 2026-05-02

### Added

- **Page Mode plugin** (`third-party-page-mode`, community, disabled by default): Turn any block into a page with `[[wikilink]]` syntax — inspired by Logseq/Roam page structure
  - **Toggle Page Mode** command: Marks the focused node as a page; children are hidden from the main tree and the node displays as `[[content]]` with accent-colored dashed underline
  - **Click to enter page**: Clicking a `[[wikilink]]` zooms into that node, showing all descendants normally — the page title is editable from within the page view
  - **Persistent page state**: Page IDs stored in `localStorage` (`mindscape_page_ids`); survives reloads
  - **Play-nice with block-ref**: Uses `::before`/`::after` pseudo-elements for bracket rendering, preserving inner DOM so `((block-ref))` pills inside page content render correctly
  - **Breadcrumb truncation**: "Toggle Breadcrumb Truncation" command scopes the breadcrumb trail to the nearest page ancestor, hiding ascendants outside the current page. The page boundary is marked with an accent-colored left border. Preference persisted in `localStorage` (`mindscape_page_breadcrumb_truncate`)

## [0.3.2] - 2026-05-02

### Added

- **Subtree export commands**: Five new Command Palette commands — "Export focused node as JSON/Markdown/OPML/Plain text/HTML" — export only the currently focused node and all its descendants (including itself), narrowing the export scope to avoid oversized export files from large outlines

## [0.3.1] - 2026-04-30

### Added

- **Linked References panel** (backlinks): When zoomed into a block, a bottom panel shows how many other blocks reference it (e.g. `3 Linked References`). Click the header to expand/collapse; click any item to jump to the referencing block
- **`getBlockBacklinks` RPC**: Main-process query that searches `content LIKE '%((id))%'` to find all nodes referencing a given block ID
- **Backlink count badges on every node**: Each outline node now displays a small accent-colored badge (e.g. `3`) when other blocks reference it. The badge appears next to the node content regardless of zoom state — scan the tree at a glance to see which blocks are referenced
- **`getBacklinkCounts` RPC**: Single-query endpoint that builds a frequency map of all `((id))` references across the entire database

### Fixed

- **App startup hang (critical)**: Fixed an infinite mutation observer loop caused by `annotateBacklinkBadges()` unconditionally writing `textContent` on existing badges. Setting `textContent` replaces the text DOM node, which fires a new `childList` mutation, which triggers `annotateBacklinkBadges()` again — repeating forever and freezing the renderer. Fixed by adding a re-entrant guard flag and only updating `textContent` when the count value actually changes
- **Backlink count SQL query**: The `LIKE` pattern `'%((%)%)%'` required three closing parens, so `((id))` references never matched. Changed to `'%((%))%'` so the query correctly finds blocks containing references
- **Block reference click-to-jump**: Changed from `click` to `mousedown` with `preventDefault()` to prevent the browser from shifting focus into the `contenteditable` editor before the jump happens — clicking a reference now navigates immediately without entering edit mode
- **`resolveBlockRef` RPC wiring**: The handler was registered by the plugin but missing from `PluginManager.buildRpcHandlers()`, causing hover tooltips to show `(error)` instead of the referenced block's content

## [0.3.0] - 2026-04-30

### Added

- **Block References** (`third-party-block-ref` plugin, community/third-party, enabled by default): Type `((block-id))` in any node to reference another block
  - **Visual rendering**: When a node is blurred, `((id))` is rendered as a styled pill (accent color, subtle background, ↪ icon) — transforms back to plain text on focus so editing works normally
  - **Hover preview**: Tooltip shows the referenced block's content (fetched via RPC, cached in-memory for instant subsequent hovers)
  - **Click to jump**: Clicking a reference zooms directly to the original block via `store.zoomIn()`
  - **Bidirectional plugin architecture**: Separate main-process RPC handler (`resolveBlockRef`) and renderer-process DOM observer with `MutationObserver`, `focusin`/`focusout` event delegation, and self-contained injected CSS
  - **Settings toggleable**: Appears in Settings → Plugins as a community plugin that can be enabled or disabled independently
  - **Copy block reference**: Right-click any bullet (•) to copy `((block-id))` to the clipboard — a toast notification confirms the copy
  - **Keyboard shortcut for copying block reference**: `Ctrl+Shift+C` (or `Cmd+Shift+C`) when focused inside a node editor copies `((block-id))`

### Fixed

- **Copy block reference UX**: The copy action (right-click bullet and `Ctrl+Shift+C`) now copies the full `((block-id))` reference syntax instead of the raw UUID string, so pasting immediately creates a working block reference

## [0.2.5] - 2026-04-30

### Added

- **Search results breadcrumb context**: Each result now shows its 1–2 ancestor levels (e.g. `Project A > backend development`) so identical content in different branches is distinguishable
- **Search match highlighting**: Query tokens are highlighted with a soft yellow background (`<mark>`) inside each result
- **Keyboard navigation for search results**: `↑/↓` cycles through results with auto-scroll; `Enter` zooms to the selected node; `Escape` clears the search
- **Search empty state**: "No matches found" message when query returns zero results

### Changed

- **Empty search results** (`(empty)`): Styled as muted italic text to reduce visual noise

## [0.2.4] - 2026-04-29

### Added

- **Export plugin** (`core-export`): Export entire outline tree as JSON, OPML, Markdown, plain text, or styled HTML via Command Palette (Ctrl+P → "Export outline as ...") or Settings → Import/Export tab

### Fixed

- **CJK text rendering / garbled Chinese**: Fixed intermittent mojibake in mixed CJK-Latin blocks caused by a font-loading race condition
  - Changed `font-display: swap` to **`font-display: block`** for all `@font-face` declarations in `src/renderer/styles/fonts.css` — prevents Chromium from rendering CJK text with a missing-glyph fallback while the 13–16 MB LXGW Bright font files are still parsing
  - Added explicit CJK fallback fonts (`Microsoft YaHei`, `PingFang SC`, `Hiragino Sans GB`) to the `--font-sans` stack in `main.css` and all theme definitions in `themeManager.ts`
  - Changed `<html lang="en">` to **`<html lang="zh-CN">`** so WebView2 applies correct typographic and fallback heuristics for Chinese content

## [0.2.3] - 2026-04-29

### Added

- **Settings → Typography**: Font size adjustment with preset options (Small 13px, Normal 15px, Large 17px, Extra Large 19px) plus custom input for manual font size entry (8-72px range)
- Font size preference persisted in `localStorage` (`outliner_uiFontSize`) and re-applied after theme changes

### Fixed

- **Settings → Typography**: Custom font size value now correctly shown in the dropdown label and custom input field on initial load
- **Search performance**: Added 200ms debounce to search input to prevent excessive RPC calls and database queries during typing
- **Outline text cursor**: `.node-editor` now explicitly uses `cursor: text` so the text insertion cursor (I-beam) appears when hovering or selecting inside a block, instead of inheriting the `cursor: grab` hand from the draggable parent node

## [0.2.2] - 2026-04-17

### Added

- **Command palette** (`core-command-palette` renderer plugin, optional in Settings): **Ctrl+P** / **Cmd+P** opens a searchable overlay listing registered commands; filter by name, id, category, or keywords; ranked results when searching; optional **Recently used** section and usage counts persisted in `localStorage` (`mindscape_command_palette_usage`, `mindscape_command_palette_recent`)
- **`CommandRegistry`** and **`RendererPluginContext.registerCommand` / `listCommands`**: global shortcut dispatch for commands that declare a `shortcut`; `commandPaletteState` lets the palette capture navigation keys while open (palette toggle still works)
- **Main-process stub** for `core-command-palette` so the plugin appears in the enable/disable list
- **`docs/command-palette-guide.md`**: reference blueprint for palette behavior (adapted from another project’s layout)

### Changed

- **`core-keyboard`**: registers **Create New Root Node** (**Ctrl+Enter**) and **Search** (**Ctrl+F**) as commands for the palette; unregisters them on plugin unload

## [0.2.1] - 2026-04-17

### Added

- **Zoom / focus persistence**: `localStorage` key `mindscape_default_focus_node`; `store.initialLoad()` validates the id with `getNode` and restores zoom on startup
- **Store helpers**: `getZoomedNodeId()` and `isZoomMode()` for the current zoom (focus) context

### Changed

- **Breadcrumb trail** (shown while zoomed): Home control with “Return to root level” tooltip; `>` separators; current segment is a non-interactive `breadcrumb-active` label (not a button); ancestor segments navigate via zoom; layout uses flex-wrap and ellipsis for long titles
- **Bullet control**: any node (including leaves) can zoom/focus into its subtree; clarified `aria-label` / `title`

### Fixed

- **Discard changes**: restoring the DB from backup clears zoom state, breadcrumbs, and the saved focus id so a stale focus target cannot linger

## [0.2.0] - 2026-04-17

### Added

- **LXGW Bright** support via local UI fonts in `src/renderer/fonts/` (directory is gitignored; obtain TTFs from the [LXGW Bright](https://github.com/lxgw/LxgwBright) release and copy them locally). Faces are registered in `src/renderer/styles/fonts.css` with `@font-face` (weights 300 / 400 / 500, normal and italic) and `font-display: swap`
- **Settings → Typography** tab: choose interface font (theme default, LXGW Bright, system UI, Nunito) with live preview; preference stored under `outliner_uiFont` and re-applied after theme changes
- **Settings export format v2**: optional `uiFont` field; import applies typography when present

### Changed

- **Nunito** for themes that use it is loaded via `fonts.css` (`@import`) instead of a separate `<link>` in `index.html`
- **Electrobun build**: copy `fonts.css` into `views/renderer/`; font binaries are copied from `src/renderer/fonts/` when present (same as local dev)

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
- **Settings export/import**: Export theme and plugin states to JSON file; import to overwrite current settings (Settings → Import / Export tab)

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

[Unreleased]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.3.3...HEAD
[0.3.3]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.7.1...v0.2.0
[0.1.7.1]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.7...v0.1.7.1
[0.1.7]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ALex-Everett-Liu/mindscape-roaming/releases/tag/v0.1.0
