# Milestones

Completed features and improvements, documented for reference.

---

## FTS5 Search Plugin (March 2025)

FTS5 full-text search is implemented in the `core-fts-search` plugin (creates `outline_nodes_fts`, triggers, `search` RPC). All built-in plugins are in Settings; users enable/disable each.

| Issue | Implementation |
|-------|----------------|
| **UI when disabled** | Search input disabled with placeholder when `core-fts-search` is not loaded; `searchAvailable` refreshed on app init and when Settings closes |
| **Rebuild on first enable** | On plugin load, if `outline_nodes` has rows but `outline_nodes_fts_docsize` is empty (token index not built), runs `INSERT INTO outline_nodes_fts(outline_nodes_fts) VALUES('rebuild')` |

**Achievement**: Implemented plugin-based search system with real-time indexing

**Technical Details**:
- FTS5 virtual tables with triggers
- Plugin architecture allowing runtime enable/disable
- Graceful degradation when disabled

See also: [architecture.md](architecture.md) for FTS5 schema details.

## Initial Release

**Achievement**: Stable core outliner with basic editing
