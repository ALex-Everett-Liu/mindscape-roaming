import type { Database } from "bun:sqlite";
import type { OutlineNode, OutlineTreeNode } from "../../../shared/types";

type Statement = ReturnType<Database["prepare"]>;

export class NodeRepository {
  private db: Database;
  private stmtGetById!: Statement;
  private stmtGetChildren!: Statement;
  private stmtInsert!: Statement;
  private stmtUpdateContent!: Statement;
  private stmtUpdateExpanded!: Statement;
  private stmtUpdatePosition!: Statement;
  private stmtUpdateParent!: Statement;
  private stmtDelete!: Statement;
  private stmtSoftDelete!: Statement;
  private stmtGetMaxPosition!: Statement;
  private stmtShiftPositions!: Statement;

  constructor(db: Database) {
    this.db = db;
    this.prepareStatements();
  }

  private prepareStatements(): void {
    this.stmtGetById = this.db.prepare(
      "SELECT * FROM outline_nodes WHERE id = ? AND is_deleted = 0"
    );
    this.stmtGetChildren = this.db.prepare(
      "SELECT * FROM outline_nodes WHERE parent_id = ? AND is_deleted = 0 ORDER BY position ASC"
    );
    this.stmtInsert = this.db.prepare(`
      INSERT INTO outline_nodes (id, content, parent_id, position, is_expanded, created_at, updated_at, is_deleted)
      VALUES ($id, $content, $parent_id, $position, $is_expanded, $created_at, $updated_at, 0)
    `);
    this.stmtUpdateContent = this.db.prepare(
      "UPDATE outline_nodes SET content = ?, updated_at = ? WHERE id = ?"
    );
    this.stmtUpdateExpanded = this.db.prepare(
      "UPDATE outline_nodes SET is_expanded = ?, updated_at = ? WHERE id = ?"
    );
    this.stmtUpdatePosition = this.db.prepare(
      "UPDATE outline_nodes SET position = ?, updated_at = ? WHERE id = ?"
    );
    this.stmtUpdateParent = this.db.prepare(
      "UPDATE outline_nodes SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?"
    );
    this.stmtDelete = this.db.prepare("DELETE FROM outline_nodes WHERE id = ?");
    this.stmtSoftDelete = this.db.prepare(
      "UPDATE outline_nodes SET is_deleted = 1, updated_at = ? WHERE id = ?"
    );
    this.stmtGetMaxPosition = this.db.prepare(
      "SELECT MAX(position) as max_pos FROM outline_nodes WHERE parent_id IS ? AND is_deleted = 0"
    );
    this.stmtShiftPositions = this.db.prepare(
      "UPDATE outline_nodes SET position = position + ? WHERE parent_id IS ? AND position >= ? AND is_deleted = 0"
    );
  }

  getById(id: string): OutlineNode | null {
    const row = this.stmtGetById.get(id) as Record<string, unknown> | null;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: Record<string, unknown>): OutlineNode {
    return {
      id: row.id as string,
      content: row.content as string,
      parent_id: row.parent_id as string | null,
      position: row.position as number,
      is_expanded: Boolean(row.is_expanded),
      created_at: row.created_at as number,
      updated_at: row.updated_at as number,
    };
  }

  getChildren(parentId: string | null): OutlineNode[] {
    if (parentId === null) {
      return (
        this.db
          .query(
            "SELECT * FROM outline_nodes WHERE parent_id IS NULL AND is_deleted = 0 ORDER BY position ASC"
          )
          .all() as Record<string, unknown>[]
      ).map(this.mapRow.bind(this));
    }
    return (this.stmtGetChildren.all(parentId) as Record<string, unknown>[]).map(
      this.mapRow.bind(this)
    );
  }

  getSubtree(parentId: string | null, maxDepth = -1, depth = 0): OutlineTreeNode[] {
    if (maxDepth !== -1 && depth > maxDepth) return [];
    const children = this.getChildren(parentId);
    return children.map((n) => ({
      ...n,
      depth,
      children:
        maxDepth === -1 || depth < maxDepth
          ? this.getSubtree(n.id, maxDepth, depth + 1)
          : [],
    }));
  }

  getAncestors(nodeId: string): OutlineNode[] {
    const ancestors: OutlineNode[] = [];
    let cur = this.getById(nodeId);
    while (cur?.parent_id) {
      const p = this.getById(cur.parent_id);
      if (p) ancestors.unshift(p);
      cur = p;
    }
    return ancestors;
  }

  create(
    content: string,
    parentId: string | null,
    position?: number,
    clientId?: string
  ): OutlineNode {
    const id = clientId ?? Bun.randomUUIDv7();
    const now = Date.now();
    if (position === undefined) {
      const r = this.stmtGetMaxPosition.get(parentId) as { max_pos: number | null };
      position = (r.max_pos ?? -1) + 1;
    } else {
      this.stmtShiftPositions.run(1, parentId, position);
    }
    this.stmtInsert.run({
      $id: id,
      $content: content,
      $parent_id: parentId,
      $position: position,
      $is_expanded: 1,
      $created_at: now,
      $updated_at: now,
    });
    return this.getById(id)!;
  }

  createAfter(content: string, afterId: string, clientId?: string): OutlineNode {
    const s = this.getById(afterId);
    if (!s) throw new Error(`Node ${afterId} not found`);
    return this.create(content, s.parent_id, s.position + 1, clientId);
  }

  updateContent(id: string, content: string): OutlineNode {
    this.stmtUpdateContent.run(content, Date.now(), id);
    return this.getById(id)!;
  }

  updateExpanded(id: string, isExpanded: boolean): OutlineNode {
    this.stmtUpdateExpanded.run(isExpanded ? 1 : 0, Date.now(), id);
    return this.getById(id)!;
  }

  move(id: string, newParentId: string | null, newPosition: number): OutlineNode {
    const node = this.getById(id);
    if (!node) throw new Error(`Node ${id} not found`);

    return this.db.transaction(() => {
      this.db.run(
        "UPDATE outline_nodes SET position = position - 1 WHERE parent_id IS ? AND position > ? AND is_deleted = 0",
        [node.parent_id, node.position]
      );
      this.stmtShiftPositions.run(1, newParentId, newPosition);
      this.stmtUpdateParent.run(newParentId, newPosition, Date.now(), id);
      return this.getById(id)!;
    })();
  }

  indent(id: string): OutlineNode | null {
    const node = this.getById(id);
    if (!node || node.position === 0) return null;
    const prev = this.db
      .query(
        "SELECT * FROM outline_nodes WHERE parent_id IS ? AND position = ? AND is_deleted = 0"
      )
      .get(node.parent_id, node.position - 1) as Record<string, unknown> | null;
    if (!prev) return null;
    const prevNode = this.mapRow(prev);
    const r = this.stmtGetMaxPosition.get(prevNode.id) as { max_pos: number | null };
    return this.move(id, prevNode.id, (r.max_pos ?? -1) + 1);
  }

  outdent(id: string): OutlineNode | null {
    const node = this.getById(id);
    if (!node?.parent_id) return null;
    const parent = this.getById(node.parent_id);
    if (!parent) return null;
    return this.move(id, parent.parent_id, parent.position + 1);
  }

  softDeleteSubtree(id: string): void {
    const now = Date.now();
    this.db.transaction(() => {
      const ids = this.db
        .query(
          `WITH RECURSIVE subtree AS (
            SELECT id FROM outline_nodes WHERE id = ?
            UNION ALL
            SELECT n.id FROM outline_nodes n JOIN subtree s ON n.parent_id = s.id
          ) SELECT id FROM subtree`
        )
        .all(id as any) as { id: string }[];
      for (const { id: rid } of ids) this.stmtSoftDelete.run(now, rid);
      const raw = this.db.query("SELECT * FROM outline_nodes WHERE id = ?").get(id) as
        | Record<string, unknown>
        | null;
      if (raw) {
        this.db.run(
          "UPDATE outline_nodes SET position = position - 1 WHERE parent_id IS ? AND position > ? AND is_deleted = 0",
          [raw.parent_id, raw.position] as [string | null, number]
        );
      }
    })();
  }

  deleteAndReparent(id: string): void {
    const node = this.getById(id);
    if (!node) return;
    this.db.transaction(() => {
      const children = this.getChildren(id);
      if (children.length > 0) {
        this.db.run(
          "UPDATE outline_nodes SET position = position + ? WHERE parent_id IS ? AND position > ? AND id != ? AND is_deleted = 0",
          [children.length, node.parent_id, node.position, id]
        );
      }
      children.forEach((c, i) => {
        this.stmtUpdateParent.run(node.parent_id, node.position + i, Date.now(), c.id);
      });
      this.stmtSoftDelete.run(Date.now(), id);
    })();
  }

  getNodeCount(): number {
    return (this.db.query("SELECT COUNT(*) as count FROM outline_nodes WHERE is_deleted = 0").get() as { count: number })
      .count;
  }
}
