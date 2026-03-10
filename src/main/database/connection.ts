import { Database } from "bun:sqlite";
import path from "path";
import { mkdirSync, existsSync, copyFileSync, unlinkSync } from "fs";

let db: Database | null = null;

const BACKUP_SUFFIX = ".backup";

function getDataDir(): string {
  return process.env.ELECTROBUN_APP_DATA ?? path.join(process.cwd(), "data");
}

export function getDbPath(): string {
  return path.join(getDataDir(), "outliner.db");
}

function getBackupPath(): string {
  return getDbPath() + BACKUP_SUFFIX;
}

export function getDatabase(): Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dataDir = getDataDir();

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath, { create: true });
  console.log("[Outliner] Database:", dbPath);

  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA cache_size = -64000");

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Create backup before first edit. Call before any mutating operation. */
export function ensureBackup(): void {
  const backupPath = getBackupPath();
  if (existsSync(backupPath)) return;

  const dbPath = getDbPath();
  if (!existsSync(dbPath)) return;

  if (!db) return;
  db.run("PRAGMA wal_checkpoint(TRUNCATE)");
  copyFileSync(dbPath, backupPath);
  console.log("[Outliner] Backup created:", backupPath);
}

/** Restore from backup (Discard). Closes DB, overwrites db file, reopens. Caller must reload plugins. */
export function restoreFromBackup(): { success: boolean; error?: string } {
  const backupPath = getBackupPath();
  const dbPath = getDbPath();
  if (!existsSync(backupPath)) {
    return { success: false, error: "No backup to restore from" };
  }

  try {
    closeDatabase();
    copyFileSync(backupPath, dbPath);
    getDatabase();
    return { success: true };
  } catch (e) {
    getDatabase();
    return { success: false, error: String(e) };
  }
}

/** Commit Save: delete backup. */
export function commitSave(): void {
  const backupPath = getBackupPath();
  if (existsSync(backupPath)) {
    try {
      unlinkSync(backupPath);
      console.log("[Outliner] Backup removed (saved)");
    } catch (e) {
      console.warn("[Outliner] Failed to remove backup:", e);
    }
  }
}

export function hasBackup(): boolean {
  return existsSync(getBackupPath());
}
