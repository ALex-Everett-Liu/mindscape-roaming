# Feature Backlog

Implementation specs for initiatives in the [roadmap](roadmap.md). Each item includes problem, solution, and relevant files.

**Status key:** Not Started · In Progress · Done

---

## Initiative 1: Save Mechanism Improvement

### Phase 1: Immediate Fixes

### 1.1 Atomic File Operations

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 1 |
| **Problem** | `copyFileSync` is not atomic. A crash during Discard (or during backup creation) leaves the destination file incomplete and corrupted. |
| **Solution** | Copy to a temporary file first, then rename. Cross-platform `rename` is atomic. |

| Location | Change |
|----------|--------|
| `ensureBackup()` | `copyFileSync(dbPath, backupTmpPath)` → `renameSync(backupTmpPath, backupPath)` |
| `restoreFromBackup()` | `copyFileSync(backupPath, dbTmpPath)` → `renameSync(dbTmpPath, dbPath)` |

**Files:** `src/main/database/connection.ts`

---

### 1.2 Fix Unlink Failure Handling

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 1 |
| **Problem** | Silently ignoring `unlinkSync` failure leaves a stale backup. Next session's Discard restores data from two sessions ago. |
| **Solution** | 1. Wrap `unlinkSync` in try-catch. 2. On failure: attempt `renameSync(backupPath, outliner.db.stale_<timestamp>)` to quarantine. 3. If rename also fails: throw error to user — "Save failed, please try again" — keep UI in "Unsaved" state. 4. Never silently swallow the failure. |

**Files:** `src/main/database/connection.ts`, `src/main/index.ts` (RPC handler)

---

### 1.3 Startup Cleanup for Stale Files

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 1 |
| **Problem** | `.backup` or `.stale` files can linger from unclean shutdowns or failed saves. |
| **Solution** | On application launch, delete any `outliner.db.backup` and `outliner.db.stale_*` files. (Coordinate with Phase 2.1 if crash recovery is implemented.) |

**Files:** `src/main/index.ts` or `src/main/database/connection.ts` (called before first DB access)

---

## Phase 2: Crash Recovery & Reliability

### 2.1 Handle Startup State (Crash Recovery Paradox)

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 2 |
| **Problem** | If the app crashes after edits, a `.backup` exists on next launch. `ensureBackup()` sees it and does nothing. User makes new edits, clicks Discard — restores stale backup, destroying both current and crashed-session edits. |
| **Solution** | On launch, if `outliner.db.backup` exists, treat as unclean shutdown. Choose one policy: |

| Policy | Behavior |
|--------|----------|
| **Auto-recover** | Delete backup; keep main DB (treat crash as "silent save") |
| **Auto-revert** | Overwrite main with backup (treat crash as "discard") |
| **Prompt user** | "Unsaved changes were found from a previous session. Restore them or delete them?" |

**Recommendation:** Start with **prompt user** for safety; consider auto-recover as an option later.

**Files:** `src/main/index.ts`, `src/renderer/` (optional startup dialog)

---

### 2.2 Remove 100ms Delay (IPC-Driven Discard)

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 2 |
| **Problem** | The 100ms `setTimeout` before `loadTree()` is a race condition. On slow hardware, the renderer may fetch data while the main process is still overwriting the file. |
| **Solution** | Make `discardAll` fully async/await over IPC. Main process returns only when DB is fully restored and ready. |

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

---

### 2.3 Durability: TRUNCATE vs WAL

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 2 |
| **Problem** | `TRUNCATE` + `synchronous = NORMAL` leaves the DB vulnerable to corruption on power loss. |
| **Short-term** | If staying on TRUNCATE, consider `PRAGMA synchronous = FULL` for better durability (at some write-performance cost). |
| **Long-term** | Phase 3 restores WAL mode via SQLite Backup API; makes this moot. |

---

## Phase 3: SQLite Backup API Refactor

### 3.1 Replace Filesystem Copies with SQLite Backup API

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 3 |
| **Problem** | Copying/overwriting SQLite files with `fs` while a connection is open is an anti-pattern. SQLite has a native Backup API for this use case. |
| **Solution** | 1. Keep `outliner.db` in **WAL mode**. 2. **ensureBackup():** Use SQLite Backup API to stream current state into `outliner.db.backup` (no need to close connections). 3. **Discard:** Use Backup API in reverse — stream `outliner.db.backup` back into live connection to `outliner.db`. |

**Benefits:** Never call `closeDatabase()`; never unload plugins; no EBUSY on `-wal`/`-shm`; natively atomic.

**Implementation:** `bun:sqlite` and `better-sqlite3` support the native SQLite Backup API. Verify Bun's binding; if not available, evaluate `better-sqlite3` migration.

---

### 3.2 Remove Plugin Unload Sequence

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 3 |
| **Problem** | `unloadAllForRestore()` is a brittle workaround to release DB handles before file overwrite. |
| **Solution** | With the Backup API, the connection stays open. No plugin unload or reload during Discard. Simplify `restoreFromBackup` and remove `unloadAllForRestore` / `reloadWithNewDatabase` from the Discard path. |

---

## Phase 4: Optional Enhancements

### 4.1 Backup Validation Before Restore

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 4 |
| **Description** | Before restore, optionally validate backup (timestamp, checksum, or SQLite integrity check) to detect corruption or accidental wrong-file restore. Complements Phase 1.2 but does not replace proper error handling. |

---

### 4.2 Tests for Failure Modes

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Phase** | 4 |
| **Description** | Add tests for: disk full during backup creation; unlink failure during Save; simulated crash during restore (if feasible); startup with stale `.backup` present. |

---

## Initiative 2: Soft Delete–Enabled Features

### SD.1 Restore API + Trash UI

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Problem** | No way to view or recover soft-deleted nodes. |
| **Solution** | Expose RPC to restore (set `is_deleted = 0`) for single node or subtree. Add trash view UI to browse soft-deleted nodes; optionally "recently deleted" quick-access. |

**Suggested order:** Do restore API first; trash UI builds on it.

---

### SD.2 Undo/Redo Plugin

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Problem** | `core-undo-redo` skeletons exist; plugin not implemented. |
| **Solution** | Implement `core-undo-redo` plugin; undo delete by toggling `is_deleted` back to 0. |

---

### SD.3 Periodic Hard-Delete Cleanup

| Field | Value |
|-------|-------|
| **Status** | Not Started |
| **Problem** | Soft-deleted rows persist forever; DB grows. |
| **Solution** | Background job (e.g., nightly) to `DELETE FROM outline_nodes WHERE is_deleted = 1 AND updated_at < ?`; configurable retention window. |

---

## Implementation References

**Save Mechanism:**
- `src/main/database/connection.ts` — ensureBackup, restoreFromBackup, commitSave
- `src/main/index.ts` — wrapMutating, restoreFromBackup RPC handler
- `src/renderer/state/store.ts` — discardAll, loadTree
