# Command palette (functionality and implementation guide)

This document describes how the **command palette** works in luhmann-roam: opening it, searching, keyboard navigation, command registration, persistence, and styling. Use it as a blueprint for a similar feature in another project.

## What the user sees

- **Open / close**: **Ctrl+P** (Windows/Linux) or **Cmd+P** (macOS). The handler calls `preventDefault()` so the browser does not open the print dialog.
- **While open**: A full-screen dimmed **overlay** centers a compact panel with a **search field** and a **scrollable list** of commands.
- **Search**: Typing filters commands by **name**, **category**, or any **keyword** string (substring match, case-insensitive). With a non-empty query, results are **sorted** so exact name matches and “starts with” matches rank above plain includes.
- **Empty search**: If there is **recent usage** data, the list splits into **“Recently Used”** and **“All Commands”** with a separator. Otherwise all commands appear in one flat list.
- **Selection**: **Arrow Up/Down** moves selection; **Enter** runs the selected command; **Escape** closes. **Click** on a row runs that command. Hovering a row updates the selection index.
- **Per-command display**: Command **name**, optional **category** (subtitle), optional **shortcut** label (informational; not parsed for execution here), and optional **usage count** badge when the command has been run before.
- **Footer**: A short hint line: navigation and Enter/Escape (appended inside the list container).

After a command runs, the palette **closes first**, then the command’s `action` runs (with `try/catch` around the call).

## Source files

| Piece | Location |
|--------|-----------|
| Logic and UI | `public/js/commandPaletteManager.js` |
| Styles (light + `prefers-color-scheme: dark`) | `public/css/features/command-palette.css` (imported from `public/css/index.css`) |
| Script tag | `public/index.html` loads `js/commandPaletteManager.js` |
| Startup | `public/js/app.js` calls `CommandPaletteManager.initialize()` |
| Optional early init | `public/js/pluginAwareInitializer.js` can call `initialize()` if the manager is present |

Global export: `window.CommandPaletteManager`.

## Module shape

The implementation uses an **IIFE** that closes over private state (`commands`, `filteredCommands`, `selectedCommandIndex`, DOM references, `isInitialized`, usage/recent caches) and returns a **public API** object. This matches other managers in the project.

## DOM structure

Created in `createCommandPaletteUI()` and appended to `document.body`:

1. **`div.command-palette-overlay`** — full viewport, flex, `display: none` until opened; `z-index` high (e.g. 10000). Clicking the **overlay** (not the inner panel) closes the palette.
2. Child **`div.command-palette`** — fixed width (~500px), column flex, max height ~70vh.
3. **`input.command-palette-search`** — search; `input` event drives filtering.
4. **`div.command-palette-list`** — scrollable; `renderCommandsList()` fills it and appends a **`div.command-palette-info`** hint at the bottom.

Rows are built by `createCommandItem()` as **`div.command-palette-item`**, with **`selected`** for the active row. Optional sections use **`command-palette-recent-section`**, **`command-palette-all-section`**, **`command-palette-section-header`**, **`command-palette-separator`**.

## Command object contract

Each command is a plain object. The manager only **requires**:

| Field | Required | Purpose |
|--------|----------|---------|
| `name` | Yes | Display label; also used as the key for **usage deduplication** and **recent list** (stored by name string). |
| `action` | Yes | Function invoked when the command runs. |

Optional fields:

| Field | Purpose |
|--------|---------|
| `category` | Shown under the name; also searchable. |
| `shortcut` | **Display only** (e.g. `"Alt+S"`). Does not register a global listener by itself. |
| `keywords` | Array of strings; each may match the search query. |

`registerCommand` rejects invalid entries (missing `name` or non-function `action`). If a command with the same `name` already exists, it is **replaced**. After each add, the full list is sorted **alphabetically by `name`**.

## Initialization flow (`initialize`)

Runs once (guarded by private `isInitialized`):

1. Load **`command_palette_usage_counts`** and **`command_palette_recent_commands`** from `localStorage`.
2. Attach a **document** `keydown` listener:
   - **Ctrl/Cmd+P** → `toggleCommandPalette()`.
   - If the palette is open → `handleKeyboardNavigation(e)` (Escape, arrows, Enter).
3. Build the DOM (`createCommandPaletteUI`).
4. Call **`registerAllCommands()`** to populate the command list.
5. Set `isInitialized = true`.

**Note:** `pluginAwareInitializer` checks `!window.CommandPaletteManager.isInitialized`, but the public API does **not** expose `isInitialized`; that property is `undefined`, so the condition is always truthy. Initialization is still safe because the **private** `isInitialized` flag prevents double work inside `initialize()`.

## How commands are populated (`registerAllCommands`)

On **every palette open**, `openCommandPalette()` calls `registerAllCommands()`. That function sets **`commands = []`** and then registers commands in order from helpers:

| Helper | Role |
|--------|------|
| `registerHotkeyCommands()` | Intended to mirror `HotkeyManager` global hotkeys; see below. |
| `registerNodeCommands()` | Nodes: add root, add child, delete, indent, outdent (uses focused `.node-text`). |
| `registerAppCommands()` | Save, language toggle, refresh, backup (if `BackupManager`). |
| `registerNavigationCommands()` | Breadcrumb clear focus, focus last node, search modal, default focus, etc. |
| `registerPluginManagerCommands()` | Open plugin modal, per-plugin enable/disable. |
| `registerModuleCommands()` | Filters (if `FilterManager`), translation toggles, EN↔ZH copy on current node, bookmarks. |

Because the array is **reset** on each open, the palette always reflects the current code paths and feature flags (`window.*` checks). Any design that relies on **`registerCommand` / `registerCommands` from outside** this file must also **hook into** `registerAllCommands()` (or stop resetting the array) or those additions will **disappear** the next time the palette opens.

## HotkeyManager integration (current behavior)

`registerHotkeyCommands()` checks `window.HotkeyManager._getGlobalHotkeys`. The **`HotkeyManager` public API** in `hotkeyManager.js` does **not** expose `_getGlobalHotkeys`, so this branch does not run. The code falls back to registering a single command, **“Toggle Hotkey Help”**, which enters hotkey mode and dispatches a synthetic `keydown` for `"h"`.

If you port this pattern, either **expose** a read-only getter for the internal hotkey map on `HotkeyManager**, or **duplicate** a small curated list of palette entries that mirror important shortcuts.

## Search and filtering (`handleSearchInput`)

- Empty query: `filteredCommands` is a copy of all `commands`.
- Non-empty: filter where query appears in `name`, `category`, or any `keyword` (each keyword is matched with `includes`).
- Sorting for non-empty query: prefer **exact** name match, then **startsWith**, then keep relative order.
- Selection resets to index `0` when the filtered set is non-empty, else `-1`.

## Recent commands and usage tracking

- **`trackCommandUsage(commandName)`** runs when a command executes successfully (before `action`, after selection): increments a per-name count, moves the name to the front of `recentCommands`, caps length (`MAX_RECENT_COMMANDS` = 10), persists to `localStorage`.
- **Keys**: `command_palette_usage_counts` (JSON object name → number), `command_palette_recent_commands` (JSON array of names).
- **Recent section**: `getValidRecentCommands()` maps recent **names** back to current command objects (drops stale names if a command was removed).

## Keyboard handling when open (`handleKeyboardNavigation`)

- **Escape**: close.
- **ArrowDown / ArrowUp**: wrap selection; re-render; `scrollIntoView({ block: "nearest" })` on the selected item.
- **Enter**: `executeCommand(filteredCommands[selectedCommandIndex])`.
- If `filteredCommands.length === 0`, arrows and Enter do nothing (except Escape).

**Important:** While the palette is open, the global listener still runs for **Ctrl/Cmd+P**, so **toggle** closes or reopens. Typing normal characters goes to the search field when it is focused (opened with `setTimeout` focus on the input).

## Focus helper: `getCurrentFocusedNodeId`

Used by palette actions that need a “current node” (e.g. language copy commands). Resolution order:

1. `.node-text:focus` → ancestor `.node[data-id]`.
2. Else `BreadcrumbManager.getCurrentFocusedNodeId()` if present.
3. Else `window.lastFocusedNodeId`.
4. Else `window.currentModalNodeId`.
5. Else first `.node` in the DOM.

## `updateLanguage(language)`

Updates the search **placeholder** (English vs Chinese) and calls `registerAllCommands()` plus `renderCommandsList()` if open. Command **names** in code are still mostly English; this is mainly placeholder/UI consistency.

## Public API summary

| Method | Purpose |
|--------|---------|
| `initialize()` | One-time setup. |
| `registerCommand(command)` | Add or replace by `name`. |
| `registerCommands(array)` | Batch `registerCommand`. |
| `openCommandPalette()` | Refresh registry, reset search/selection, show overlay, focus input. |
| `closeCommandPalette()` | Hide overlay. |
| `updateLanguage(language)` | Placeholder + refresh list if open. |
| `_getCommands()` | Debug: current command array. |
| `_getUsageCounts()` / `_getRecentCommands()` | Debug. |
| `_resetUsageData()` | Clear usage + recent in memory and `localStorage`. |

## Styling notes (`command-palette.css`)

- Overlay: semi-transparent full screen; panel offset from top (`padding-top`) for a VS Code–like placement.
- Items: flex row; left block name + category, right block usage badge + shortcut.
- **Dark mode**: `@media (prefers-color-scheme: dark)` overrides backgrounds and borders for the palette, search, items, sections, and info bar.

## Porting checklist (another project)

1. **Global shortcut**: Listen for Ctrl/Cmd+P on `document`, `preventDefault`, toggle visibility.
2. **Modal layering**: Fixed overlay + high `z-index`; click-outside-to-close on overlay only.
3. **Command registry**: Decide between a **static list**, **rebuilt on each open** (this project), or **merge** user-registered commands without wiping.
4. **Search**: Normalize query (trim, lower case); search across labels and tags; optional relevance sort.
5. **Keyboard**: When open, handle Escape/Up/Down/Enter without breaking search input focus; consider stopping propagation where needed.
6. **Persistence**: Optional usage/recent with stable command IDs (this project uses **display names**—renaming a command breaks continuity for recent/history).
7. **Accessibility**: Consider `role="listbox"`, `aria-activedescendant`, and focus trap if you need full a11y (not implemented in the current file).
8. **Hotkey display**: Keep shortcut labels as documentation unless you centralize real shortcut registration in one module.

This should be enough to reproduce a **searchable, keyboard-driven command palette** with **optional usage/recent sections** and **integration points** for app-specific actions.
