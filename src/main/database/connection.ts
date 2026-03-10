import { Database } from "bun:sqlite";
import path from "path";
import { mkdirSync, existsSync } from "fs";
import Electrobun from "electrobun/bun";

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;

  // Prefer project ./data/ when it exists (dev) or ELECTROBUN_APP_DATA env
  const appDataEnv = process.env.ELECTROBUN_APP_DATA;
  const projectDataDir = path.join(process.cwd(), "data");
  const projectDbPath = path.join(projectDataDir, "outliner.db");

  let dataDir: string;
  if (appDataEnv) {
    dataDir = appDataEnv;
  } else if (existsSync(projectDbPath)) {
    // Use existing DB in project data folder
    dataDir = projectDataDir;
  } else {
    dataDir = Electrobun.Utils.paths.userData;
  }

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
