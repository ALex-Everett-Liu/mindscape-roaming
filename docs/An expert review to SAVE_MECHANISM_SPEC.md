
This is an excellent, clear, and highly professional technical specification. It outlines the mechanism, correctly identifies its own assumptions, and pinpoints the exact areas where failure modes are most likely to occur. 

Based on an expert review of the system, [relying on OS-level filesystem copying] wrapping a live SQLite database is a well-known source of [edge-case bugs], specifically on Windows (due to aggressive file locking) and [under edge-case conditions] like power-loss.

Here is an analysis and actionable advice, starting with direct answers to your questions, followed by architectural recommendations.

---

### Part 1: Answers to "Questions for Expert Review"

#### 1. File copy atomicity (`copyFileSync`)

**Answer:** `copyFileSync` is **not atomic** on any major operating system. 
It streams data from the source to the destination. If the disk fills up, the process crashes, or power is lost halfway through the operation, the destination file will be incomplete and wholly corrupted. Because your Discard mechanism relies on `copyFileSync` to overwrite the main DB, a crash during Discard will leave the main `outliner.db` corrupted and unreadable.

**Fix:** To achieve atomic overwrites, you must copy to a temporary file first, and then rename it. Cross-platform `rename` (or `mv`) is atomic.

```javascript
// Example of Atomic Backup Creation
fs.copyFileSync(dbPath, backupTmpPath);
fs.renameSync(backupTmpPath, backupPath);

// Example of Atomic Discard
fs.copyFileSync(backupPath, dbTmpPath);
fs.renameSync(dbTmpPath, dbPath);
```

#### 2. `commitSave` (unlink) semantics

**Answer:** Silently ignoring an `unlinkSync` failure is a critical bug. As you noted in 5.3, it leaves a stale backup. Furthermore, on Windows, file handles are sometimes held open by antivirus scanners or delayed garbage collection, meaning `unlinkSync` is more prone to fail randomly than on macOS/Linux.

**Fix:** 
1. **Try Catch with Rename:** If `unlinkSync` fails, attempt to `renameSync` the backup to `outliner.db.stale_<timestamp>`. If *that* fails, you must throw an error to the user ("Save failed, please try again").
2. **Startup cleanup:** Add logic on application startup to delete any `.backup` or `.stale` files found (assuming you don't implement crash recovery—see Part 2).

#### 3. TRUNCATE vs WAL & Durability

**Answer:** `TRUNCATE` combined with `synchronous = NORMAL` in SQLite means the database is significantly vulnerable to corruption on an OS crash or power failure. `NORMAL` means SQLite hands data to the OS but doesn't wait for the disk hardware to write it (`fsync`). 

In a document-based desktop app where the DB *is* the document, users expect word-processor levels of reliability. 
*   If you stay on `TRUNCATE`, you should strongly consider `PRAGMA synchronous = FULL` (the default). 
*   **The better path:** Move back to WAL mode. (See Part 2 for how to solve the `EBUSY` error).

#### 4. Alternative designs (SQLite Backup API)

**Answer:** Yes, the **SQLite Backup API** is the industry standard for this exact use case. Relying on filesystem copies while an SQLite connection is open (even if idle) is an anti-pattern. 
The SQLite Backup API safely copies the database to another file, handling all locks, WAL, and Journal files completely internally. It eliminates the TOCTOU (Time of Check to Time of Use) filesystem race conditions entirely.

#### 5. Stale backup on unlink failure

**Answer:** Yes, validating the backup would mitigate this, but it treats the symptom, not the core problem. The core problem is ignoring the `unlinkSync` failure. If a save fails to clear the state, the Save has failed and the UI should reflect that the file is currently "Unsaved".

---

### Part 2: Critical Vulnerabilities & Improvements

#### A. The Crash Recovery Paradox (Section 5.4)
Your document correctly identifies a scenario where the application crashes *after* an edit, leaving a `.backup` file behind. However, the current flow creates a severe logic bomb on the *next* launch:
1. App crashes. Main DB has 3 unsaved edits. `.backup` file exists from before those edits.
2. User reopens the app.
3. User makes a *new* edit. 
4. `ensureBackup()` fires, sees `.backup` already exists, and **does nothing**.
5. User clicks Discard.
6. The app restores the stale backup, utterly destroying both the current session's edits *and* the edits from the crashed session.

**Recommendation:** You must handle startup state. On application launch, if `outliner.db.backup` exists, you experienced an unclean shutdown. You should either:
*   **Auto-recover:** Discard the backup and keep the main DB (treating the crash as a "silent save").
*   **Auto-revert:** Overwrite the main DB with the backup (treating the crash as a "discard").
*   **Prompt the user:** "Unsaved changes were found from a previous session. Restore them or delete them?"

#### B. The 100ms Delay Code-Smell (Section 3.4)
Relying on a 100ms delay (`setTimeout`) to "let the main process settle" before reloading the tree in the renderer is a glaring race condition. On slower hardware, or heavily loaded machines, 100ms will not be enough, and the frontend will fetch data while the backend is still overwriting the file, resulting in read errors or corrupted UI state.

**Recommendation:** Make `discardAll` entirely synchronous/async-await driven over your IPC bridge.

```javascript
// Main Process RPC Handler
async handleDiscard() {
    await restoreFromBackup(); 
    return true; // only return when DB is fully loaded and ready
}

// Renderer Process
async discardAll() {
    setLoading(true);
    await window.ipc.invoke('handleDiscard');
    await loadTree(); // fetch from a guaranteed-ready database
    setLoading(false);
}
```

#### C. Abandon Filesystem Copies for the SQLite Backup API
The root cause of almost all risks in the document (EBUSY errors, WAL file headaches, atomicity issues, plugin connection dropping) stems from trying to manipulate the SQLite file using Node's `fs` module. 

Most Node/SQLite libraries (like `better-sqlite3`) support the native SQLite Backup API.

**How it works:**
1. Keep `outliner.db` in `WAL` mode (best performance, excellent durability).
2. On `ensureBackup()`, use the SQLite Backup API to stream the current state into `outliner.db.backup`. (No need to close connections).
3. On `Discard()`, use the SQLite Backup API *in reverse*. Stream `outliner.db.backup` back into your live, open connection to `outliner.db`. 

**Why this is better:**
*   You **never** have to call `closeDatabase()`.
*   You **never** have to unload plugins.
*   You **never** get `EBUSY` on `-wal` or `-shm` files because SQLite manages them internally.
*   It is natively atomic and safe against concurrent ops.

### Summary Conclusion

The current design is cleverly constructed but relies on filesystem workarounds that will result in corrupted DBs for users during edge cases (crashes, strict antivirus locks). 

**Immediate fixes:** Implement atomic renaming for your file copies, and never silently swallow fail-to-delete errors to prevent the "Stale Backup" logic bomb. 
**Long-term fixes:** Refactor to use the native SQLite Backup API, allowing you to reinstate WAL mode and remove the brittle plugin unloading sequence.
