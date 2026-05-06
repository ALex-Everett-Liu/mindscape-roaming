# Roadmap

High-level strategic plan for Mindscape Outliner. Multiple initiatives tracked here; implementation specs live in [feature-backlog.md](feature-backlog.md).

---

## Initiative 1: Save Mechanism Improvement

*Target: word-processor-level reliability for backup-on-edit.*

The current design relies on filesystem copying and has known edge-case failure modes. **This initiative will be developed on an experimental branch (`exp/save-refactor`)** to avoid destabilizing the main branch while the refactor is in progress.

### Strategic Context

Based on the [expert review](An%20expert%20review%20to%20SAVE_MECHANISM_SPEC.md) of the [SAVE_MECHANISM_SPEC](SAVE_MECHANISM_SPEC.md), key risks are:

| Risk | Impact |
|------|--------|
| Non-atomic file operations | Partial writes corrupt DB on crash/disk-full |
| Silently ignored unlink failures | Stale backup → destructive Discard |
| TRUNCATE + `synchronous = NORMAL` | Higher corruption risk on power loss |
| 100ms UI delay | Race condition on slower hardware |
| Crash recovery paradox | Stale backup can destroy current edits on Discard |
| **Root cause** | Filesystem manipulation of a live SQLite DB is an anti-pattern; SQLite Backup API exists for this |

### Phases and Targets

| Phase | Focus | Target |
|-------|-------|--------|
| **Phase 1** | Immediate fixes — critical bugs, low risk | Next release |
| **Phase 2** | Crash recovery & reliability | 1–2 releases after Phase 1 |
| **Phase 3** | SQLite Backup API refactor — root-cause fix | Major release |
| **Phase 4** | Optional enhancements | Opportunistic |

### Phase Overview

**Phase 1 — Immediate Fixes:**
- Atomic file operations (copy-then-rename)
- Fix unlink failure handling (no silent ignore)
- Startup cleanup for stale `.backup` / `.stale` files

**Phase 2 — Crash Recovery & Reliability:**
- Handle startup state (crash recovery paradox — prompt user)
- Remove 100ms IPC race (fully async Discard)
- Durability: consider `PRAGMA synchronous = FULL` short-term

**Phase 3 — SQLite Backup API Refactor:**
- Replace filesystem copies with SQLite Backup API
  - `sqlite3_backup_init()` / `sqlite3_backup_step()` via `bun:sqlite` or native addon
  - Online backup: source DB stays live during copy → no close/reopen needed
  - Incremental: `backup_remaining()` / `backup_pagecount()` for progress
- Restore WAL mode; eliminate EBUSY and plugin-unload brittleness
  - WAL no longer conflicts because we don't close/overwrite the DB file
- Remove plugin unload sequence during Discard
  - Backup API copies from backup handle → live DB handle; prepared statements stay valid
  - `reloadWithNewDatabase()` no longer needed; plugins survive Discard untouched
- Save flow becomes: `BEGIN` → batch edits → `COMMIT` / `ROLLBACK`
  - Discard = `ROLLBACK` (no file I/O at all)
  - Save = `COMMIT` + delete backup file
- Renderer: `updateContent` should await RPC result before updating local tree
  - Currently fire-and-forget (`store.ts:207`); failed RPC leaves UI/DB inconsistent

**Phase 4 — Optional Enhancements:**
- Backup validation before restore
- Tests for failure modes (disk full, unlink failure, crash simulation)
- Consider `PRAGMA journal_mode = WAL2` (begin-concurrent) for future multi-tab support

### Dependency Order

```
exp/save-refactor (all phases developed here, then merged to main)
│
├─ Phase 1 ─────────────────────────────────────────────────────────────►
│  │  (1.1–1.3 independent; can parallelize)
│  ▼
├─ Phase 2 ─────────────────────────────────────────────────────────────►
│  │  (2.1 may conflict with 1.3 startup cleanup — coordinate)
│  ▼
├─ Phase 3 ─────────────────────────────────────────────────────────────►
│  │  (Major refactor; unblocks WAL, removes plugin unload)
│  ▼
└─ Phase 4 (optional, can merge progressively)
```

---

## Initiative 2: Soft Delete–Enabled Features

*Independent of Save Mechanism.* The DB supports `is_deleted` on `outline_nodes`; deleted nodes are hidden but remain in DB.

| Goal | Current state | Future plan |
|------|---------------|-------------|
| **Trash / recently deleted** | No UI | Trash view; optionally "recently deleted" quick-access |
| **Data recovery** | No restore API | RPC to restore (set `is_deleted = 0`) for node or subtree |
| **Undo/redo** | Skeleton only | `core-undo-redo` plugin; undo delete via `is_deleted` toggle |
| **Periodic hard-delete cleanup** | Rows persist forever | Background job; configurable retention |

*Suggested order:* Restore API + trash UI → `core-undo-redo` plugin → optional hard-delete cleanup.

---

## Initiative 3: Design Token Naming Standardization

*Low priority — cosmetic improvement.*

### Current State

CSS variables use **omitted-primary** convention across 5 themes (`native`, `light`, `organic`, `ocean`, `forest`) and all plugins:

| Variable | Role | Standard equivalent |
|---|---|---|
| `--text` | Primary text | `--text-primary` |
| `--text-muted` | Secondary text | `--text-secondary` |
| `--bg` | Primary background | `--bg-primary` |
| `--bg-secondary` | Secondary background | `--bg-secondary` |

### Problem

- `--text` / `--bg` meaning "primary" is implicit — confusing for contributors familiar with design systems that use explicit tier suffixes (Material Design, Primer, Radix)
- Earlier sidebar/bookmark code incorrectly used `--text-primary` / `--bg-primary` (nonexistent in any theme), falling back to hardcoded dark colors on non-dark themes
- Fixed in v0.3.6 by switching to existing `--text` / `--bg`, but the underlying naming inconsistency remains

### Proposed

1. Rename variables across all 5 theme definitions (`themeManager.ts`) and all CSS references (`main.css` + plugin-injected CSS)
2. Old names as fallback aliases (e.g. `var(--text-primary, var(--text))`) during transition
3. Remove old names after one release cycle

### Effort

~20 files, mostly search-replace. Low risk, can be done opportunistically.

---

## Initiative 4: Context Menu UX at Scale

*Defer until 30+ right-click actions exist. Current ~7 items — no urgency.*

The `core-context-menu` plugin mechanically handles overflow (`max-height` + `overflow-y: auto`) but lacks discoverability for long menus:

| Gap | Symptom at 30+ items | Fix |
|-----|----------------------|-----|
| No scroll indicators | User doesn't know items exist off-screen | ▲/▼ arrow hints on `scroll` event |
| No keyboard navigation | Must mouse-hover and click each item | ↑↓ to focus, Enter to execute |
| Flat list, no grouping | Hard to scan | Section headers (e.g. "Page", "Links") |
| No search/filter | Must visually scan all items | Type-to-filter input at menu top |

Priority: keyboard nav → scroll arrows → section headers → type-to-filter.

---

## Initiative 5: Advanced Search

*Phase 1 complete (v0.4.4). Phase 2 planned — structured query builder overlay.*

The existing toolbar search (`core-fts-search`) uses FTS5 full-text search with implicit AND-joining of tokens. Phase 1 added FTS5 boolean expression pass-through so users can type `"mode 1" NOT "model 1"` directly. Phase 2 will add a structured GUI for users who don't want to learn FTS5 syntax.

### Phase 1 — FTS5 Boolean Syntax (done)

- `core-fts-search` RPC handler detects boolean operators (`AND`, `OR`, `NOT`), quoted `"phrases"`, and `(grouping)` — passes through to FTS5 MATCH instead of tokenizing + AND-joining
- Toolbar search input has a `title` hint: *Use AND, OR, NOT, quotes for advanced search*
- Standard search with no operators continues to tokenize + AND-join with prefix `*`

### Phase 2 — Structured Query Builder Overlay (planned)

New community plugin `core-advanced-search` (disabled by default):

| Feature | Detail |
|---|---|
| **Launch** | Command palette: "Advanced Search" (category: Data) |
| **UI** | Standalone overlay (pattern: Query Nodes by Size) |
| **Include field** | Space-separated terms → AND-joined; tokenized with prefix `*` |
| **Exclude field** | Space-separated terms → each prefixed with NOT |
| **Optional field** | Space-separated terms → OR-joined |
| **Category filter** | Dropdown or free-text input |
| **Node size range** | Min/max inputs (reuse slider + number pattern from Node Size plugin) |
| **Preview** | Read-only display of the constructed FTS5 MATCH expression |
| **Results** | Same display as toolbar search (breadcrumbs, highlight, click to navigate) |
| **Backend** | Reuses existing `search` RPC — constructs FTS5 expression string and passes to `core-fts-search` handler |
| **No new RPC** | Pure client-side expression builder → existing `api.search()` |

### Dependency Order

```
Phase 1 (done) ────► Phase 2 (planned)
   │                      │
   └─ FTS5 pass-through    └─ Structured overlay reuses search RPC
      (core-fts-search)       (no backend changes needed)
```

### Syntax Reference (FTS5 Boolean)

| Expression | Meaning |
|---|---|
| `hello world` | Both tokens must match (AND) |
| `"exact phrase"` | Exact phrase match |
| `hello OR world` | Either token matches |
| `"mode 1" NOT "model 1"` | Phrase "mode 1" present, "model 1" absent |
| `(cats OR dogs) AND NOT birds` | Grouping with exclusion |
| `prefix*` | Explicit prefix match (automatic in simple mode) |

---

## References

- [feature-backlog.md](feature-backlog.md) — Implementation specs for all initiatives
- [milestones.md](milestones.md) — Completed work (e.g. FTS5 search)
- [SAVE_MECHANISM_SPEC](SAVE_MECHANISM_SPEC.md) — Current technical specification
- [architecture.md](architecture.md) — Project architecture
