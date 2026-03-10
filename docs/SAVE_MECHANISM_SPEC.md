# Save Mechanism: Technical Specification for Expert Review

This document describes the current backup-on-edit save mechanism in Mindscape Outliner. It is intended for expert review regarding reliability, correctness, and potential failure modes.

---

## 1. Overview

**User-facing behavior:** Manual save mode. Edits (content, expand/collapse, create, move, indent, outdent, delete) write directly to the SQLite database. A "Save" button commits the session; a "Discard" button restores the database to its state before the first edit. Until Save or Discard, the user can revert all changes.

**Implementation strategy:** Copy-on-first-write + file overwrite on Discard. All edits modify `outliner.db` immediately. On the first mutating operation, a backup copy (`outliner.db.backup`) is created. Save = delete the backup. Discard = overwrite the main DB with the backup and reload.

---

## 2. Data Flow

### 2.1 Files Involved

| File | Role |
|------|------|
| `outliner.db` | Main SQLite database. All edits write here immediately. |
| `outliner.db.backup` | Snapshot taken on first edit. Used only for Discard. |

**Note:** SQLite uses `PRAGMA journal_mode = TRUNCATE` (single-file mode). No `-wal` or `-shm` files are created. This was chosen to avoid EBUSY on Windows when deleting WAL/SHM during Discard.

### 2.2 Save Flow

```
User edits
  → Mutating RPC (createNode, updateNode, moveNode, indentNode, outdentNode, deleteNode)
  → ensureBackup() runs before handler: if no .backup exists, copyFileSync(dbPath, backupPath)
  → Handler executes: writes to outliner.db via SQLite

User clicks Save
  → commitSave(): unlinkSync(backupPath)
  → Backup deleted; main DB is already current
```

### 2.3 Discard Flow

```
User clicks Discard
  → Main: unloadAllForRestore() — unload plugins, remove RPC handlers
  → Main: closeDatabase() — close SQLite connection
  → Main: copyFileSync(backupPath, dbPath) — overwrite main DB with backup
  → Main: unlink any stale -wal/-shm (from prior WAL mode, if present)
  → Main: getDatabase() — reopen connection to restored DB
  → Main: reloadWithNewDatabase() — reload plugins with new DB reference
  → Renderer: clear tree, show loading, 100ms delay, loadTree()
  → Renderer: fetch subtree from main, update UI
```

---

## 3. Key Implementation Details

### 3.1 ensureBackup (DB Layer)

- **When:** Called before every mutating RPC (via `wrapMutating`).
- **Logic:** If `outliner.db.backup` exists, do nothing. Else `copyFileSync(outliner.db, outliner.db.backup)`.
- **Invariant:** Backup is a point-in-time copy from *before* any edits in the current session. No checkpoint or flush is run before the copy (TRUNCATE mode keeps everything in the main file).

### 3.2 restoreFromBackup (DB Layer)

- **When:** User clicks Discard.
- **Order of operations:**
  1. `closeDatabase()` — releases SQLite connection.
  2. `copyFileSync(backupPath, dbPath)` — overwrites main DB.
  3. Delete any `-wal`/`-shm` files (legacy from prior WAL usage).
  4. `getDatabase()` — opens new connection to restored file.
- **No transaction:** This is file-level replacement, not SQL-level rollback.

### 3.3 Plugin Unload Before Restore

- Before `restoreFromBackup`, the main process calls `pluginManager.unloadAllForRestore()`.
- This unloads all plugins (releases DB references, prepared statements, RPC handlers).
- Rationale: Ensure no plugin holds the DB connection when we close and overwrite the file.

### 3.4 UI State After Discard

- Store clears `modifiedNodeIds`, sets `tree: []`, `loading: true`.
- 100ms delay before `loadTree()` (to let main process settle).
- `loadTree()` fetches subtree from main and updates UI.

---

## 4. Assumptions and Invariants

| Assumption | Risk if violated |
|------------|------------------|
| Single process, single DB connection | Multiple writers could corrupt; we assume single user, single connection |
| No external modification of outliner.db | Another process editing the file could cause inconsistency |
| Backup is created before first edit | If ensureBackup fails or is skipped, Discard has nothing to restore |
| copyFileSync is atomic on the filesystem | Depends on OS; partial copy could corrupt |
| TRUNCATE mode = single file | WAL would require extra handling of -wal/-shm on Discard |

---

## 5. Potential Failure Modes

### 5.1 Backup Creation

- **ensureBackup skipped:** If `wrapMutating` is not applied to a mutating op, that op could modify DB without a backup. Discard would be partial or incorrect.
- **Disk full during copy:** `copyFileSync` could throw; the mutating op may or may not have run. Partial inconsistency possible.

### 5.2 Discard

- **Backup missing:** User edited but backup was never created (bug) or was deleted. Discard returns "No backup to restore from".
- **copyFileSync failure:** E.g. permission denied, disk full. We catch, reopen DB (possibly in wrong state), return error to user.
- **Plugin reload failure:** DB is restored, but plugins fail to reload. App may be in broken state (missing RPC handlers).

### 5.3 Save

- **Unlink backup fails:** Backup file remains. Next edit session reuses it (ensureBackup sees backup exists and skips). The backup is then *stale* (from previous session). If user Discards, they get old data from two sessions ago. **This is a known gap.**

### 5.4 Crash / Power Loss

- **Between edit and Save:** DB has edits; backup exists. On restart, backup is stale (from before this session’s edits). User has no way to Discard; data is already committed to main DB.
- **During restoreFromBackup:** If crash happens between `closeDatabase` and `copyFileSync` completion, main DB could be truncated/overwritten partially. Risk of corruption.

---

## 6. Questions for Expert Review

1. **File copy atomicity:** Is `copyFileSync` (Node/Bun fs API) atomic on Windows/macOS/Linux for overwriting an existing file? Or can a partial write leave the DB corrupted?

2. **commitSave (unlink) semantics:** If `unlinkSync(backupPath)` fails, we only log. The backup remains. Is there a cleaner way to handle this, or should we retry/alert the user?

3. **TRUNCATE vs WAL:** We chose TRUNCATE to avoid EBUSY when removing -wal/-shm on Discard. For a single-user desktop app with moderate write load, is TRUNCATE acceptable? What are the durability implications of `synchronous = NORMAL` with TRUNCATE?

4. **Alternative designs:** Would SQLite’s backup API, or an in-memory diff + replay approach, be more robust for this use case? The current design favors simplicity (file copy) over transactional semantics.

5. **Stale backup on unlink failure:** As noted in 5.3, if we fail to delete the backup on Save, the next session’s Discard would restore from an older session. Should we validate backup timestamp or checksum before using it for restore?

---

## 7. References

- `src/main/database/connection.ts` — ensureBackup, restoreFromBackup, commitSave
- `src/main/index.ts` — wrapMutating, restoreFromBackup RPC handler
- `src/renderer/state/store.ts` — discardAll, loadTree
- `docs/architecture.md` — High-level save mechanism description
