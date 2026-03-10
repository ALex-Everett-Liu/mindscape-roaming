## Save Mechanism Improvement Roadmap

This roadmap outlines the future plan for improving the backup-on-edit save mechanism in Mindscape Outliner, based on the [expert review](An%20expert%20review%20to%20SAVE_MECHANISM_SPEC.md) of the [SAVE_MECHANISM_SPEC](SAVE_MECHANISM_SPEC.md). The current design relies on filesystem copying and has known edge-case failure modes; these improvements aim to achieve word-processor-level reliability for a document-based desktop app.

---

## Summary of Expert Findings

The current mechanism is clever but vulnerable to:
- **Non-atomic file operations** — partial writes can corrupt the DB on crash or disk-full
- **Silently ignored unlink failures** — leads to stale backup and destructive Discard
- **TRUNCATE mode + `synchronous = NORMAL`** — higher corruption risk on power loss
- **100ms UI delay** — race condition on slower hardware
- **Crash recovery paradox** — stale backup from previous session can destroy current edits on Discard
- **Root cause** — filesystem manipulation of a live SQLite DB is an anti-pattern; the SQLite Backup API exists for this use case

---

## Phase 1: Immediate Fixes (Low Risk, High Impact)

*Target: Next release. These address critical bugs without major architectural change.*

### 1.1 Atomic File Operations

**Problem:** `copyFileSync` is not atomic. A crash during Discard (or during backup creation) leaves the destination file incomplete and corrupted.

**Solution:** Copy to a temporary file first, then rename. Cross-platform `rename` is atomic.

| Location | Change |
|----------|--------|
| `ensureBackup()` | `copyFileSync(dbPath, backupTmpPath)` → `renameSync(backupTmpPath, backupPath)` |
| `restoreFromBackup()` | `copyFileSync(backupPath, dbTmpPath)` → `renameSync(dbTmpPath, dbPath)` |

**Files:** `src/main/database/connection.ts`

### 1.2 Fix Unlink Failure Handling

**Problem:** Silently ignoring `unlinkSync` failure leaves a stale backup. Next session’s Discard restores data from two sessions ago.

**Solution:**
1. Wrap `unlinkSync` in try-catch.
2. On failure: attempt `renameSync(backupPath, outliner.db.stale_<timestamp>)` to quarantine the stale file.
3. If rename also fails: throw error to user — "Save failed, please try again" — and keep UI in "Unsaved" state.
4. Never silently swallow the failure.

**Files:** `src/main/database/connection.ts`, `src/main/index.ts` (RPC handler)

### 1.3 Startup Cleanup for Stale Files

**Problem:** `.backup` or `.stale` files can linger from unclean shutdowns or failed saves.

**Solution:** On application launch, delete any `outliner.db.backup` and `outliner.db.stale_*` files. (This assumes Phase 2 crash recovery is not yet implemented; if it is, coordinate with that logic.)

**Files:** `src/main/index.ts` or `src/main/database/connection.ts` (called before first DB access)

---

## Phase 2: Crash Recovery & Reliability (Medium Effort)

*Target: 1–2 releases after Phase 1. Addresses the "Crash Recovery Paradox" and UI race condition.*

### 2.1 Handle Startup State (Crash Recovery Paradox)

**Problem:** If the app crashes after edits, a `.backup` exists on next launch. `ensureBackup()` sees it and does nothing. User makes new edits, clicks Discard — and restores the stale backup, destroying both current and crashed-session edits.

**Solution:** On launch, if `outliner.db.backup` exists, treat it as an unclean shutdown. Choose one policy:

| Policy | Behavior |
|--------|----------|
| **Auto-recover** | Delete backup; keep main DB (treat crash as "silent save") |
| **Auto-revert** | Overwrite main with backup (treat crash as "discard") |
| **Prompt user** | "Unsaved changes were found from a previous session. Restore them or delete them?" |

**Recommendation:** Start with **prompt user** for safety; consider auto-recover as an option later.

**Files:** `src/main/index.ts`, `src/renderer/` (optional startup dialog)

### 2.2 Remove 100ms Delay (IPC-Driven Discard)

**Problem:** The 100ms `setTimeout` before `loadTree()` is a race condition. On slow hardware, the renderer may fetch data while the main process is still overwriting the file.

**Solution:** Make `discardAll` fully async/await over IPC. Main process only returns when the DB is fully restored and ready. Renderer then loads tree.

```javascript
// Main: handleDiscard returns only when restoreFromBackup() is complete
async handleDiscard() {
  await restoreFromBackup();
  return true;
}

// Renderer: await IPC, then load
async discardAll() {
  setLoading(true);
  await window.ipc.invoke('handleDiscard');
  await loadTree();
  setLoading(false);
}
```

**Files:** `src/renderer/state/store.ts`, `src/main/index.ts`

### 2.3 Durability: TRUNCATE vs WAL

**Problem:** `TRUNCATE` + `synchronous = NORMAL` leaves the DB vulnerable to corruption on power loss.

**Short-term:** If staying on TRUNCATE, consider `PRAGMA synchronous = FULL` for better durability (at some write-performance cost).

**Long-term:** Phase 3 restores WAL mode via SQLite Backup API, making this moot.

---

## Phase 3: SQLite Backup API Refactor (Long-Term, High Impact)

*Target: Major release. Eliminates the root cause of EBUSY, WAL headaches, atomicity issues, and plugin-unload brittleness.*

### 3.1 Replace Filesystem Copies with SQLite Backup API

**Problem:** Copying/overwriting SQLite files with `fs` while a connection is open is an anti-pattern. SQLite has a native Backup API for this exact use case.

**Solution:**
1. Keep `outliner.db` in **WAL mode** (best performance, excellent durability).
2. **ensureBackup():** Use the SQLite Backup API to stream the current state into `outliner.db.backup`. No need to close connections.
3. **Discard:** Use the SQLite Backup API in reverse — stream `outliner.db.backup` back into the live connection to `outliner.db`.

**Benefits:**
- Never call `closeDatabase()`
- Never unload plugins
- No EBUSY on `-wal`/`-shm`; SQLite manages them internally
- Natively atomic and safe against concurrent ops

**Implementation:** `bun:sqlite` and `better-sqlite3` support the native SQLite Backup API. Verify Bun’s binding; if not available, evaluate `better-sqlite3` migration.

### 3.2 Remove Plugin Unload Sequence

**Problem:** `unloadAllForRestore()` is a brittle workaround to release DB handles before file overwrite.

**Solution:** With the Backup API, the connection stays open. No plugin unload or reload during Discard. Simplify `restoreFromBackup` and remove `unloadAllForRestore` / `reloadWithNewDatabase` from the Discard path.

---

## Phase 4: Optional Enhancements

*Lower priority; can be done opportunistically.*

### 4.1 Backup Validation Before Restore

Before restore, optionally validate backup (timestamp, checksum, or SQLite integrity check) to detect corruption or accidental wrong-file restore. Complements Phase 1.2 but does not replace proper error handling.

### 4.2 Tests for Failure Modes

Add tests for:
- Disk full during backup creation
- Unlink failure during Save
- Simulated crash during restore (if feasible)
- Startup with stale `.backup` present

---

## Dependency Order

```
Phase 1 ──────────────────────────────────────────────────────────────►
   │
   │  (1.1–1.3 are independent; can be done in parallel)
   │
   ▼
Phase 2 ──────────────────────────────────────────────────────────────►
   │
   │  (2.1 may conflict with 1.3 startup cleanup — coordinate)
   │  (2.2 independent)
   │
   ▼
Phase 3 ──────────────────────────────────────────────────────────────►
   │
   │  (Major refactor; unblocks WAL, removes plugin unload)
   │
   ▼
Phase 4 (optional)
```

---

## Future: Soft Delete–Enabled Features

The database already supports soft delete (`is_deleted` on `outline_nodes`). Deleted nodes are hidden from the tree and search, but remain in the DB. This enables several features that are **not yet implemented**:

| Goal | Current state | Future plan |
|------|---------------|-------------|
| **Undo/redo** | `core-undo-redo` in skeletons but plugin not implemented | Implement `core-undo-redo` plugin; undo delete by toggling `is_deleted` back to 0 |
| **Trash / recently deleted** | No UI | Add trash view to browse soft-deleted nodes; optionally show "recently deleted" quick-access |
| **Data recovery** | No restore API | Expose RPC to restore (set `is_deleted = 0`) for single node or subtree |
| **Periodic hard-delete cleanup** | Soft-deleted rows persist forever | Background job (e.g., nightly) to `DELETE FROM outline_nodes WHERE is_deleted = 1 AND updated_at < ?`; configurable retention window |

**Suggested dependency order:** (1) Restore API + trash UI, (2) `core-undo-redo` plugin, (3) optional hard-delete cleanup.

---

## References

- [milestones.md](milestones.md) — Completed features (e.g. FTS5 search plugin)
- [SAVE_MECHANISM_SPEC](SAVE_MECHANISM_SPEC.md) — Current technical specification
- [An expert review to SAVE_MECHANISM_SPEC](An%20expert%20review%20to%20SAVE_MECHANISM_SPEC.md) — Source of improvements
- [architecture.md](architecture.md) — Project architecture
- `src/main/database/connection.ts` — ensureBackup, restoreFromBackup, commitSave
- `src/main/index.ts` — wrapMutating, restoreFromBackup RPC handler
- `src/renderer/state/store.ts` — discardAll, loadTree
