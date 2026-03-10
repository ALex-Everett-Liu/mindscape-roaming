# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ALex-Everett-Liu/mindscape-roaming/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ALex-Everett-Liu/mindscape-roaming/releases/tag/v0.1.0
