import { Database } from "bun:sqlite";
import path from "path";
import { mkdirSync, existsSync } from "fs";
import Electrobun from "electrobun/bun";

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;

  // Use Electrobun's app-specific user data directory (e.g. %APPDATA%/sh.blackboard.outliner/dev)
  const dataDir = Electrobun.Utils.paths.userData;
  const dbPath = path.join(dataDir, "outliner.db");

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath, { create: true });

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
