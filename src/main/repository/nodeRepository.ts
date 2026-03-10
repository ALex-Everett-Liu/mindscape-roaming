import type { Database } from "bun:sqlite";
import type { OutlineNode, OutlineTreeNode } from "../rpc/types";

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
    return row ? this.mapRowToNode(row) : null;
  }

  private mapRowToNode(row: Record<string, unknown>): OutlineNode {
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
      ).map(this.mapRowToNode.bind(this));
    }
    return (
      this.stmtGetChildren.all(parentId) as Record<string, unknown>[]
    ).map(this.mapRowToNode.bind(this));
  }

  getRootNodes(): OutlineNode[] {
    return this.getChildren(null);
  }

  getSubtree(
    parentId: string | null = null,
    maxDepth: number = -1,
    currentDepth: number = 0
  ): OutlineTreeNode[] {
    if (maxDepth !== -1 && currentDepth > maxDepth) return [];

    const children = this.getChildren(parentId);

    return children.map((node) => ({
      ...node,
      depth: currentDepth,
      children:
        maxDepth === -1 || currentDepth < maxDepth
          ? this.getSubtree(node.id, maxDepth, currentDepth + 1)
          : [],
    }));
  }

  getAncestors(nodeId: string): OutlineNode[] {
    const ancestors: OutlineNode[] = [];
    let current = this.getById(nodeId);

    while (current && current.parent_id) {
      const parent = this.getById(current.parent_id);
      if (parent) ancestors.unshift(parent);
      current = parent;
    }

    return ancestors;
  }

  search(query: string, limit: number = 50): OutlineNode[] {
    const ftsQuery = query
      .split(/\s+/)
      .map((term) => `"${term}"*`)
      .join(" AND ");

    const rows = this.db
      .query(
        `
        SELECT n.* FROM outline_nodes n
        JOIN outline_nodes_fts fts ON n.rowid = fts.rowid
        WHERE outline_nodes_fts MATCH ? AND n.is_deleted = 0
        ORDER BY rank
        LIMIT ?
      `
      )
      .all(ftsQuery, limit) as Record<string, unknown>[];

    return rows.map(this.mapRowToNode.bind(this));
  }

  create(
    content: string,
    parentId: string | null,
    position?: number
  ): OutlineNode {
    const id = Bun.randomUUIDv7();
    const now = Date.now();

    if (position === undefined) {
      const result = this.stmtGetMaxPosition.get(parentId) as {
        max_pos: number | null;
      };
      position = (result.max_pos ?? -1) + 1;
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

  createAfter(content: string, afterSiblingId: string): OutlineNode {
    const sibling = this.getById(afterSiblingId);
    if (!sibling) throw new Error(`Node ${afterSiblingId} not found`);

    return this.create(content, sibling.parent_id, sibling.position + 1);
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

    const prevSibling = this.db
      .query(
        "SELECT * FROM outline_nodes WHERE parent_id IS ? AND position = ? AND is_deleted = 0"
      )
      .get(node.parent_id, node.position - 1) as Record<string, unknown> | null;

    if (!prevSibling) return null;

    const prevNode = this.mapRowToNode(prevSibling);
    const maxPos = this.stmtGetMaxPosition.get(prevNode.id) as {
      max_pos: number | null;
    };
    const newPosition = (maxPos.max_pos ?? -1) + 1;

    return this.move(id, prevNode.id, newPosition);
  }

  outdent(id: string): OutlineNode | null {
    const node = this.getById(id);
    if (!node || !node.parent_id) return null;

    const parent = this.getById(node.parent_id);
    if (!parent) return null;

    return this.move(id, parent.parent_id, parent.position + 1);
  }

  softDeleteSubtree(id: string): void {
    const now = Date.now();

    this.db.transaction(() => {
      const descendants = this.db
        .query(
          `
          WITH RECURSIVE subtree AS (
            SELECT id FROM outline_nodes WHERE id = ?
            UNION ALL
            SELECT n.id FROM outline_nodes n
            JOIN subtree s ON n.parent_id = s.id
          )
          SELECT id FROM subtree
        `
        )
        .all(id) as { id: string }[];

      for (const desc of descendants) {
        this.stmtSoftDelete.run(now, desc.id);
      }

      const rawNode = this.db
        .query("SELECT * FROM outline_nodes WHERE id = ?")
        .get(id) as Record<string, unknown> | null;

      if (rawNode) {
        this.db.run(
          "UPDATE outline_nodes SET position = position - 1 WHERE parent_id IS ? AND position > ? AND is_deleted = 0",
          [rawNode.parent_id, rawNode.position]
        );
      }
    })();
  }

  deleteAndReparent(id: string): void {
    const node = this.getById(id);
    if (!node) return;

    this.db.transaction(() => {
      const children = this.getChildren(id);

      // First shift siblings to make room for reparented children
      if (children.length > 0) {
        this.db.run(
          "UPDATE outline_nodes SET position = position + ? WHERE parent_id IS ? AND position > ? AND id != ? AND is_deleted = 0",
          [children.length, node.parent_id, node.position, id]
        );
      }

      // Then move children to fill the gap
      for (let i = 0; i < children.length; i++) {
        this.stmtUpdateParent.run(
          node.parent_id,
          node.position + i,
          Date.now(),
          children[i].id
        );
      }

      this.stmtSoftDelete.run(Date.now(), id);
    })();
  }

  reorderChildren(parentId: string | null): void {
    const children = this.getChildren(parentId);

    this.db.transaction(() => {
      children.forEach((child, index) => {
        if (child.position !== index) {
          this.stmtUpdatePosition.run(index, Date.now(), child.id);
        }
      });
    })();
  }

  getNodeCount(): number {
    const result = this.db
      .query("SELECT COUNT(*) as count FROM outline_nodes WHERE is_deleted = 0")
      .get() as { count: number };
    return result.count;
  }
}
