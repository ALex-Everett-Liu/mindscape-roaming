import type { Database } from "bun:sqlite";

export function seedInitialData(db: Database): void {
  const count = db
    .query("SELECT COUNT(*) as count FROM outline_nodes")
    .get() as { count: number };

  if (count.count > 0) return;

  const now = Date.now();

  const rootId = Bun.randomUUIDv7();
  const child1Id = Bun.randomUUIDv7();
  const child2Id = Bun.randomUUIDv7();
  const grandchildId = Bun.randomUUIDv7();

  const insert = db.prepare(`
    INSERT INTO outline_nodes (id, content, parent_id, position, is_expanded, created_at, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);

  db.transaction(() => {
    insert.run(rootId, "Welcome to Outliner", null, 0, 1, now, now);
    insert.run(
      child1Id,
      "Click on any bullet to zoom in",
      rootId,
      0,
      1,
      now,
      now
    );
    insert.run(
      child2Id,
      "Use Tab/Shift+Tab to indent/outdent",
      rootId,
      1,
      1,
      now,
      now
    );
    insert.run(
      grandchildId,
      "Press Enter to create a new sibling",
      child1Id,
      0,
      1,
      now,
      now
    );
  })();
}
