import type { Database } from "bun:sqlite";

interface Migration {
  version: number;
  name: string;
  up: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "create_outline_nodes",
    up: `
      CREATE TABLE IF NOT EXISTS outline_nodes (
        id          TEXT PRIMARY KEY,
        content     TEXT NOT NULL DEFAULT '',
        parent_id   TEXT,
        position    INTEGER NOT NULL DEFAULT 0,
        is_expanded INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES outline_nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON outline_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_position ON outline_nodes(parent_id, position);
      CREATE INDEX IF NOT EXISTS idx_nodes_content ON outline_nodes(content);
    `,
  },
  {
    version: 2,
    name: "create_metadata_table",
    up: `
      CREATE TABLE IF NOT EXISTS app_metadata (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `,
  },
  {
    version: 3,
    name: "add_is_deleted_soft_delete",
    up: `
      ALTER TABLE outline_nodes ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON outline_nodes(is_deleted);
    `,
  },
  {
    version: 4,
    name: "add_fts_search",
    up: `
      CREATE VIRTUAL TABLE IF NOT EXISTS outline_nodes_fts USING fts5(
        content,
        content='outline_nodes',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS outline_nodes_ai AFTER INSERT ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;

      CREATE TRIGGER IF NOT EXISTS outline_nodes_ad AFTER DELETE ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(outline_nodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END;

      CREATE TRIGGER IF NOT EXISTS outline_nodes_au AFTER UPDATE OF content ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(outline_nodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO outline_nodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;
    `,
  },
];

export function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version  INTEGER PRIMARY KEY,
      name     TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = db
    .query("SELECT version FROM _migrations ORDER BY version")
    .all() as { version: number }[];

  const appliedVersions = new Set(applied.map((m) => m.version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    console.log(`Running migration ${migration.version}: ${migration.name}`);

    db.transaction(() => {
      // Run the full migration - don't split by ; as it breaks BEGIN/END blocks (triggers)
      db.run(migration.up.trim());

      db.run(
        "INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [migration.version, migration.name, Date.now()]
      );
    })();
  }
}
