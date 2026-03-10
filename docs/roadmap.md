# Roadmap

High-level strategic plan for Mindscape Outliner. Multiple initiatives tracked here; implementation specs live in [feature-backlog.md](feature-backlog.md).

---

## Initiative 1: Save Mechanism Improvement

*Target: word-processor-level reliability for backup-on-edit.*

The current design relies on filesystem copying and has known edge-case failure modes.

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
- Restore WAL mode; eliminate EBUSY and plugin-unload brittleness
- Remove plugin unload sequence during Discard

**Phase 4 — Optional Enhancements:**
- Backup validation before restore
- Tests for failure modes (disk full, unlink failure, crash simulation)

### Dependency Order

```
Phase 1 ──────────────────────────────────────────────────────────────►
   │  (1.1–1.3 independent; can parallelize)
   ▼
Phase 2 ──────────────────────────────────────────────────────────────►
   │  (2.1 may conflict with 1.3 startup cleanup — coordinate)
   ▼
Phase 3 ──────────────────────────────────────────────────────────────►
   │  (Major refactor; unblocks WAL, removes plugin unload)
   ▼
Phase 4 (optional)
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

## References

- [feature-backlog.md](feature-backlog.md) — Implementation specs for all initiatives
- [milestones.md](milestones.md) — Completed work (e.g. FTS5 search)
- [SAVE_MECHANISM_SPEC](SAVE_MECHANISM_SPEC.md) — Current technical specification
- [architecture.md](architecture.md) — Project architecture
