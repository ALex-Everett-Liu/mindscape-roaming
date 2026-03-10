import { Database } from "bun:sqlite";
import path from "path";

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;

  const dbPath = path.join(
    process.env.ELECTROBUN_APP_DATA ?? "./data",
    "outliner.db"
  );

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
