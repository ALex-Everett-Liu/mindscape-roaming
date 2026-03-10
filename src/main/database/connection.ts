import { Database } from "bun:sqlite";
import path from "path";
import { mkdirSync, existsSync } from "fs";

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;

  // Use project's ./data/ folder. Override with ELECTROBUN_APP_DATA if set.
  const dataDir = process.env.ELECTROBUN_APP_DATA ?? path.join(process.cwd(), "data");

  const dbPath = path.join(dataDir, "outliner.db");

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
