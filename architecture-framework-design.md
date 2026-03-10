
Roudn 1: I want to use Electrobun ( https://github.com/blackboardsh/electrobun , http://blackboard.sh/electrobun ) to build a desktop outliner app like WorkFlowy but use SQLite to store its data, please design its framework for me. 

---

# Electrobun Desktop Outliner App — Framework Design

## Overview

This is a comprehensive framework design for a **WorkFlowy-like outliner** built with [Electrobun](https://github.com/blackboardsh/electrobun), using SQLite for persistent storage. The architecture follows Electrobun's process model: a **Bun-based backend** (zig/bun process) handling data and logic, and a **web-based frontend** (browser view) for the UI.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Electrobun App                       │
│                                                         │
│  ┌───────────────────────┐   ┌───────────────────────┐  │
│  │   Bun Process (Main)  │   │  BrowserView (UI)     │  │
│  │                       │   │                       │  │
│  │  ┌─────────────────┐  │   │  ┌─────────────────┐  │  │
│  │  │  SQLite Layer   │  │   │  │  Preact + HTM   │  │  │
│  │  │  (bun:sqlite)   │  │   │  │  (Outliner UI)  │  │  │
│  │  │                 │  │   │  │                 │  │  │
│  │  │  - Database     │  │   │  │  - Tree View    │  │  │
│  │  │  - Migrations   │  │   │  │  - Editor       │  │  │
│  │  │  - Repository   │  │   │  │  - Keyboard Nav │  │  │
│  │  └─────────────────┘  │   │  │  - Drag & Drop  │  │  │
│  │                       │   │  └─────────────────┘  │  │
│  │  ┌─────────────────┐  │   │                       │  │
│  │  │  RPC Handlers   │◄─┼───┼──►  RPC Bridge       │  │
│  │  │  (API Layer)    │  │   │   (electrobun/browser)│  │
│  │  └─────────────────┘  │   │                       │  │
│  └───────────────────────┘   └───────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
electrobun-outliner/
├── electrobun.config.ts            # Electrobun build/app configuration
├── package.json
├── tsconfig.json
├── src/
│   ├── main/                       # Bun process (main)
│   │   ├── index.ts                # Entry point: window creation, RPC setup
│   │   ├── database/
│   │   │   ├── connection.ts       # SQLite connection manager
│   │   │   ├── migrations.ts       # Schema migrations
│   │   │   └── seed.ts             # Initial data seeding
│   │   ├── repository/
│   │   │   └── nodeRepository.ts   # Data access layer (CRUD + tree ops)
│   │   ├── services/
│   │   │   └── outlineService.ts   # Business logic layer
│   │   └── rpc/
│   │       ├── handlers.ts         # RPC handler registration
│   │       └── types.ts            # Shared types for RPC messages
│   │
│   └── renderer/                   # BrowserView (frontend)
│       ├── index.html              # HTML entry point
│       ├── index.ts                # Frontend entry: app bootstrap
│       ├── rpc/
│       │   └── api.ts              # RPC client calls to main process
│       ├── state/
│       │   └── store.ts            # Client-side state management
│       ├── components/
│       │   ├── App.ts              # Root component
│       │   ├── OutlineTree.ts      # Recursive tree renderer
│       │   ├── OutlineNode.ts      # Single node component
│       │   ├── NodeEditor.ts       # Inline content editor
│       │   ├── Breadcrumb.ts       # Zoom breadcrumb trail
│       │   └── Toolbar.ts          # Top toolbar / search
│       ├── hooks/
│       │   ├── useKeyboard.ts      # Keyboard shortcut handling
│       │   └── useDragDrop.ts      # Drag and drop logic
│       └── styles/
│           └── main.css            # Styles
│
└── resources/                      # App icons, etc.
```

---

## 1. Electrobun Configuration

```typescript
// electrobun.config.ts
import type { ElectrobunConfig } from "electrobun";

const config: ElectrobunConfig = {
  name: "Outliner",
  identifier: "sh.blackboard.outliner",
  version: "0.1.0",
  main: "./src/main/index.ts",
  renderer: {
    index: "./src/renderer/index.html",
  },
  build: {
    // Electrobun bundles Bun runtime + your code
    target: "bun",
  },
};

export default config;
```

---

## 2. Shared Types (RPC Contract)

```typescript
// src/main/rpc/types.ts

// ─── Database Model ───────────────────────────────────
export interface OutlineNode {
  id: string;
  content: string;
  parent_id: string | null;
  position: number;
  is_expanded: boolean;
  created_at: number;
  updated_at: number;
}

// ─── Tree representation for the UI ──────────────────
export interface OutlineTreeNode extends OutlineNode {
  children: OutlineTreeNode[];
  depth: number;
}

// ─── RPC Request/Response Types ──────────────────────

export interface CreateNodeParams {
  content: string;
  parent_id: string | null;
  position?: number; // auto-calculated if omitted
  insertAfterId?: string; // insert after this sibling
}

export interface UpdateNodeParams {
  id: string;
  content?: string;
  is_expanded?: boolean;
}

export interface MoveNodeParams {
  id: string;
  new_parent_id: string | null;
  new_position: number;
}

export interface IndentNodeParams {
  id: string; // becomes child of previous sibling
}

export interface OutdentNodeParams {
  id: string; // becomes sibling of current parent
}

export interface DeleteNodeParams {
  id: string;
  deleteChildren: boolean; // true = delete subtree, false = reparent children
}

export interface GetSubtreeParams {
  parent_id: string | null; // null = get root-level nodes
  depth?: number;           // how many levels deep, -1 = unlimited
}

export interface SearchParams {
  query: string;
  limit?: number;
}

export interface ZoomParams {
  node_id: string; // show this node as the "root"
}

// ─── RPC Response Wrappers ───────────────────────────
export interface RpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## 3. Database Layer

### 3.1 Connection Manager

```typescript
// src/main/database/connection.ts
import { Database } from "bun:sqlite";
import path from "path";

let db: Database | null = null;

export function getDatabase(): Database {
  if (db) return db;

  // Store in app data directory
  // Electrobun provides app paths; fallback for dev
  const dbPath = path.join(
    process.env.ELECTROBUN_APP_DATA || "./data",
    "outliner.db"
  );

  db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrent read/write performance
  db.run("PRAGMA journal_mode = WAL");
  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");
  // Optimize for performance
  db.run("PRAGMA synchronous = NORMAL");
  db.run("PRAGMA cache_size = -64000"); // 64MB cache

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
```

### 3.2 Migrations

```typescript
// src/main/database/migrations.ts
import { Database } from "bun:sqlite";

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

      -- Triggers to keep FTS in sync
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
  // Create migrations tracking table
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
      // Execute multi-statement migration
      const statements = migration.up
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of statements) {
        db.run(stmt);
      }

      db.run(
        "INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [migration.version, migration.name, Date.now()]
      );
    })();
  }
}
```

### 3.3 Seed Data

```typescript
// src/main/database/seed.ts
import { Database } from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";

export function seedInitialData(db: Database): void {
  const count = db.query("SELECT COUNT(*) as count FROM outline_nodes").get() as { count: number };

  if (count.count > 0) return; // Already has data

  const now = Date.now();

  const rootId = uuidv4();
  const child1Id = uuidv4();
  const child2Id = uuidv4();
  const grandchildId = uuidv4();

  const insert = db.prepare(`
    INSERT INTO outline_nodes (id, content, parent_id, position, is_expanded, created_at, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);

  db.transaction(() => {
    insert.run(rootId, "Welcome to Outliner", null, 0, 1, now, now);
    insert.run(child1Id, "Click on any bullet to zoom in", rootId, 0, 1, now, now);
    insert.run(child2Id, "Use Tab/Shift+Tab to indent/outdent", rootId, 1, 1, now, now);
    insert.run(grandchildId, "Press Enter to create a new sibling", child1Id, 0, 1, now, now);
  })();
}
```

---

## 4. Repository Layer (Data Access)

```typescript
// src/main/repository/nodeRepository.ts
import { Database } from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";
import type { OutlineNode, OutlineTreeNode } from "../rpc/types";

export class NodeRepository {
  private db: Database;

  // Prepared statements (cached for performance)
  private stmtGetById;
  private stmtGetChildren;
  private stmtInsert;
  private stmtUpdateContent;
  private stmtUpdateExpanded;
  private stmtUpdatePosition;
  private stmtUpdateParent;
  private stmtDelete;
  private stmtSoftDelete;
  private stmtGetMaxPosition;
  private stmtShiftPositions;

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

    this.stmtDelete = this.db.prepare(
      "DELETE FROM outline_nodes WHERE id = ?"
    );

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

  // ─── READ Operations ─────────────────────────────────

  getById(id: string): OutlineNode | null {
    return this.stmtGetById.get(id) as OutlineNode | null;
  }

  getChildren(parentId: string | null): OutlineNode[] {
    // bun:sqlite handles NULL binding for IS comparison
    if (parentId === null) {
      return this.db
        .query("SELECT * FROM outline_nodes WHERE parent_id IS NULL AND is_deleted = 0 ORDER BY position ASC")
        .all() as OutlineNode[];
    }
    return this.stmtGetChildren.all(parentId) as OutlineNode[];
  }

  getRootNodes(): OutlineNode[] {
    return this.getChildren(null);
  }

  /**
   * Build a tree structure recursively.
   * @param parentId - Start from this parent (null = root)
   * @param maxDepth - Maximum depth to fetch (-1 = unlimited)
   * @param currentDepth - Internal tracker
   */
  getSubtree(
    parentId: string | null = null,
    maxDepth: number = -1,
    currentDepth: number = 0
  ): OutlineTreeNode[] {
    if (maxDepth !== -1 && currentDepth > maxDepth) return [];

    const children = this.getChildren(parentId);

    return children.map((node) => ({
      ...node,
      is_expanded: Boolean(node.is_expanded),
      depth: currentDepth,
      children:
        maxDepth === -1 || currentDepth < maxDepth
          ? this.getSubtree(node.id, maxDepth, currentDepth + 1)
          : [],
    }));
  }

  /**
   * Get ancestors of a node (for breadcrumb).
   */
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

  /**
   * Full-text search using FTS5.
   */
  search(query: string, limit: number = 50): OutlineNode[] {
    const ftsQuery = query
      .split(/\s+/)
      .map((term) => `"${term}"*`)
      .join(" AND ");

    return this.db
      .query(
        `
        SELECT n.* FROM outline_nodes n
        JOIN outline_nodes_fts fts ON n.rowid = fts.rowid
        WHERE outline_nodes_fts MATCH ? AND n.is_deleted = 0
        ORDER BY rank
        LIMIT ?
      `
      )
      .all(ftsQuery, limit) as OutlineNode[];
  }

  // ─── WRITE Operations ────────────────────────────────

  /**
   * Create a new node. Returns the created node.
   */
  create(
    content: string,
    parentId: string | null,
    position?: number
  ): OutlineNode {
    const id = uuidv4();
    const now = Date.now();

    // Auto-calculate position if not provided
    if (position === undefined) {
      const result = this.stmtGetMaxPosition.get(parentId) as {
        max_pos: number | null;
      };
      position = (result.max_pos ?? -1) + 1;
    } else {
      // Shift existing siblings to make room
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

  /**
   * Insert a new node after a specific sibling.
   */
  createAfter(
    content: string,
    afterSiblingId: string
  ): OutlineNode {
    const sibling = this.getById(afterSiblingId);
    if (!sibling) throw new Error(`Node ${afterSiblingId} not found`);

    return this.create(content, sibling.parent_id, sibling.position + 1);
  }

  /**
   * Update node content.
   */
  updateContent(id: string, content: string): OutlineNode {
    this.stmtUpdateContent.run(content, Date.now(), id);
    return this.getById(id)!;
  }

  /**
   * Toggle or set expanded state.
   */
  updateExpanded(id: string, isExpanded: boolean): OutlineNode {
    this.stmtUpdateExpanded.run(isExpanded ? 1 : 0, Date.now(), id);
    return this.getById(id)!;
  }

  /**
   * Move a node to a new parent/position.
   */
  move(id: string, newParentId: string | null, newPosition: number): OutlineNode {
    const node = this.getById(id);
    if (!node) throw new Error(`Node ${id} not found`);

    return this.db.transaction(() => {
      // Close the gap in the old parent
      this.db.run(
        "UPDATE outline_nodes SET position = position - 1 WHERE parent_id IS ? AND position > ? AND is_deleted = 0",
        [node.parent_id, node.position]
      );

      // Make room in the new parent
      this.stmtShiftPositions.run(1, newParentId, newPosition);

      // Move the node
      this.stmtUpdateParent.run(newParentId, newPosition, Date.now(), id);

      return this.getById(id)!;
    })();
  }

  /**
   * Indent: make this node a child of its previous sibling.
   */
  indent(id: string): OutlineNode | null {
    const node = this.getById(id);
    if (!node || node.position === 0) return null; // Can't indent first child

    // Find previous sibling
    const prevSibling = this.db
      .query(
        "SELECT * FROM outline_nodes WHERE parent_id IS ? AND position = ? AND is_deleted = 0"
      )
      .get(node.parent_id, node.position - 1) as OutlineNode | null;

    if (!prevSibling) return null;

    // Move node to be the last child of previous sibling
    const maxPos = this.stmtGetMaxPosition.get(prevSibling.id) as {
      max_pos: number | null;
    };
    const newPosition = (maxPos.max_pos ?? -1) + 1;

    return this.move(id, prevSibling.id, newPosition);
  }

  /**
   * Outdent: make this node a sibling of its parent.
   */
  outdent(id: string): OutlineNode | null {
    const node = this.getById(id);
    if (!node || !node.parent_id) return null; // Can't outdent root-level

    const parent = this.getById(node.parent_id);
    if (!parent) return null;

    // Move to be the sibling right after parent
    return this.move(id, parent.parent_id, parent.position + 1);
  }

  /**
   * Soft-delete a node and all its descendants.
   */
  softDeleteSubtree(id: string): void {
    const now = Date.now();

    this.db.transaction(() => {
      // Recursive CTE to find all descendants
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

      // Close position gap for the deleted node
      const node = this.getById(id); // already soft-deleted, need raw query
      const rawNode = this.db
        .query("SELECT * FROM outline_nodes WHERE id = ?")
        .get(id) as OutlineNode | null;

      if (rawNode) {
        this.db.run(
          "UPDATE outline_nodes SET position = position - 1 WHERE parent_id IS ? AND position > ? AND is_deleted = 0",
          [rawNode.parent_id, rawNode.position]
        );
      }
    })();
  }

  /**
   * Reparent children before deleting a node.
   */
  deleteAndReparent(id: string): void {
    const node = this.getById(id);
    if (!node) return;

    this.db.transaction(() => {
      const children = this.getChildren(id);

      // Move each child to the deleted node's parent
      for (let i = 0; i < children.length; i++) {
        this.stmtUpdateParent.run(
          node.parent_id,
          node.position + i,
          Date.now(),
          children[i].id
        );
      }

      // Shift siblings after the deleted node to accommodate
      if (children.length > 1) {
        this.db.run(
          "UPDATE outline_nodes SET position = position + ? WHERE parent_id IS ? AND position > ? AND id != ? AND is_deleted = 0",
          [children.length - 1, node.parent_id, node.position, id]
        );
      }

      this.stmtSoftDelete.run(Date.now(), id);
    })();
  }

  /**
   * Normalize positions for siblings (close gaps).
   */
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

  /**
   * Get count of all active nodes.
   */
  getNodeCount(): number {
    const result = this.db
      .query("SELECT COUNT(*) as count FROM outline_nodes WHERE is_deleted = 0")
      .get() as { count: number };
    return result.count;
  }
}
```

---

## 5. Service Layer (Business Logic)

```typescript
// src/main/services/outlineService.ts
import type { Database } from "bun:sqlite";
import { NodeRepository } from "../repository/nodeRepository";
import type {
  OutlineNode,
  OutlineTreeNode,
  CreateNodeParams,
  UpdateNodeParams,
  MoveNodeParams,
  IndentNodeParams,
  OutdentNodeParams,
  DeleteNodeParams,
  GetSubtreeParams,
  SearchParams,
  RpcResult,
} from "../rpc/types";

export class OutlineService {
  private repo: NodeRepository;

  constructor(db: Database) {
    this.repo = new NodeRepository(db);
  }

  // ─── Queries ──────────────────────────────────────────

  getFullTree(): RpcResult<OutlineTreeNode[]> {
    try {
      const tree = this.repo.getSubtree(null, -1);
      return { success: true, data: tree };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  getSubtree(params: GetSubtreeParams): RpcResult<OutlineTreeNode[]> {
    try {
      const tree = this.repo.getSubtree(params.parent_id, params.depth ?? -1);
      return { success: true, data: tree };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  getNode(id: string): RpcResult<OutlineNode> {
    try {
      const node = this.repo.getById(id);
      if (!node) return { success: false, error: "Node not found" };
      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  getAncestors(nodeId: string): RpcResult<OutlineNode[]> {
    try {
      return { success: true, data: this.repo.getAncestors(nodeId) };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  search(params: SearchParams): RpcResult<OutlineNode[]> {
    try {
      const results = this.repo.search(params.query, params.limit);
      return { success: true, data: results };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ─── Mutations ────────────────────────────────────────

  createNode(params: CreateNodeParams): RpcResult<OutlineNode> {
    try {
      let node: OutlineNode;

      if (params.insertAfterId) {
        node = this.repo.createAfter(params.content, params.insertAfterId);
      } else {
        node = this.repo.create(params.content, params.parent_id, params.position);
      }

      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  updateNode(params: UpdateNodeParams): RpcResult<OutlineNode> {
    try {
      let node: OutlineNode | null = null;

      if (params.content !== undefined) {
        node = this.repo.updateContent(params.id, params.content);
      }

      if (params.is_expanded !== undefined) {
        node = this.repo.updateExpanded(params.id, params.is_expanded);
      }

      if (!node) {
        node = this.repo.getById(params.id);
      }

      return { success: true, data: node! };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  moveNode(params: MoveNodeParams): RpcResult<OutlineNode> {
    try {
      const node = this.repo.move(params.id, params.new_parent_id, params.new_position);
      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  indentNode(params: IndentNodeParams): RpcResult<OutlineNode | null> {
    try {
      const node = this.repo.indent(params.id);
      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  outdentNode(params: OutdentNodeParams): RpcResult<OutlineNode | null> {
    try {
      const node = this.repo.outdent(params.id);
      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  deleteNode(params: DeleteNodeParams): RpcResult<void> {
    try {
      if (params.deleteChildren) {
        this.repo.softDeleteSubtree(params.id);
      } else {
        this.repo.deleteAndReparent(params.id);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  // ─── Utility ──────────────────────────────────────────

  getStats(): RpcResult<{ nodeCount: number }> {
    try {
      return {
        success: true,
        data: { nodeCount: this.repo.getNodeCount() },
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
```

---

## 6. RPC Handlers (Main Process ↔ Renderer Bridge)

```typescript
// src/main/rpc/handlers.ts
import { type BrowserView } from "electrobun/bun";
import { OutlineService } from "../services/outlineService";
import type {
  CreateNodeParams,
  UpdateNodeParams,
  MoveNodeParams,
  IndentNodeParams,
  OutdentNodeParams,
  DeleteNodeParams,
  GetSubtreeParams,
  SearchParams,
} from "./types";

/**
 * Register all RPC handlers that the renderer can call.
 * 
 * Electrobun's RPC system allows type-safe communication between
 * the Bun main process and BrowserView renderer processes.
 */
export function registerRpcHandlers(
  browserView: BrowserView,
  service: OutlineService
): void {
  const rpc = browserView.rpc;

  // ─── Tree Queries ───────────────────────────────────

  rpc.handle("getFullTree", async () => {
    return service.getFullTree();
  });

  rpc.handle("getSubtree", async (params: GetSubtreeParams) => {
    return service.getSubtree(params);
  });

  rpc.handle("getNode", async (params: { id: string }) => {
    return service.getNode(params.id);
  });

  rpc.handle("getAncestors", async (params: { nodeId: string }) => {
    return service.getAncestors(params.nodeId);
  });

  rpc.handle("search", async (params: SearchParams) => {
    return service.search(params);
  });

  rpc.handle("getStats", async () => {
    return service.getStats();
  });

  // ─── Mutations ──────────────────────────────────────

  rpc.handle("createNode", async (params: CreateNodeParams) => {
    return service.createNode(params);
  });

  rpc.handle("updateNode", async (params: UpdateNodeParams) => {
    return service.updateNode(params);
  });

  rpc.handle("moveNode", async (params: MoveNodeParams) => {
    return service.moveNode(params);
  });

  rpc.handle("indentNode", async (params: IndentNodeParams) => {
    return service.indentNode(params);
  });

  rpc.handle("outdentNode", async (params: OutdentNodeParams) => {
    return service.outdentNode(params);
  });

  rpc.handle("deleteNode", async (params: DeleteNodeParams) => {
    return service.deleteNode(params);
  });
}
```

---

## 7. Main Process Entry Point

```typescript
// src/main/index.ts
import { Electrobun, BrowserWindow } from "electrobun/bun";
import { getDatabase, closeDatabase } from "./database/connection";
import { runMigrations } from "./database/migrations";
import { seedInitialData } from "./database/seed";
import { OutlineService } from "./services/outlineService";
import { registerRpcHandlers } from "./rpc/handlers";

// ─── Initialize Database ──────────────────────────────
const db = getDatabase();
runMigrations(db);
seedInitialData(db);

// ─── Initialize Service Layer ─────────────────────────
const outlineService = new OutlineService(db);

// ─── Create Main Window ───────────────────────────────
const mainWindow = new BrowserWindow({
  title: "Outliner",
  width: 900,
  height: 700,
  minWidth: 400,
  minHeight: 300,
  url: "electrobun://renderer/index.html", // Electrobun serves bundled renderer
});

// ─── Register RPC Handlers ────────────────────────────
registerRpcHandlers(mainWindow.browserView, outlineService);

// ─── App Lifecycle ────────────────────────────────────
Electrobun.events.on("will-quit", () => {
  closeDatabase();
});

// Handle window close
mainWindow.on("close", () => {
  Electrobun.quit();
});
```

---

## 8. Frontend — RPC Client API

```typescript
// src/renderer/rpc/api.ts
import { rpc } from "electrobun/browser";
import type {
  OutlineNode,
  OutlineTreeNode,
  CreateNodeParams,
  UpdateNodeParams,
  MoveNodeParams,
  IndentNodeParams,
  OutdentNodeParams,
  DeleteNodeParams,
  GetSubtreeParams,
  SearchParams,
  RpcResult,
} from "../../main/rpc/types";

/**
 * Type-safe API client wrapping Electrobun RPC calls to the main process.
 */
export const api = {
  // ─── Queries ────────────────────────────────────────
  getFullTree: (): Promise<RpcResult<OutlineTreeNode[]>> =>
    rpc.invoke("getFullTree"),

  getSubtree: (params: GetSubtreeParams): Promise<RpcResult<OutlineTreeNode[]>> =>
    rpc.invoke("getSubtree", params),

  getNode: (id: string): Promise<RpcResult<OutlineNode>> =>
    rpc.invoke("getNode", { id }),

  getAncestors: (nodeId: string): Promise<RpcResult<OutlineNode[]>> =>
    rpc.invoke("getAncestors", { nodeId }),

  search: (params: SearchParams): Promise<RpcResult<OutlineNode[]>> =>
    rpc.invoke("search", params),

  getStats: (): Promise<RpcResult<{ nodeCount: number }>> =>
    rpc.invoke("getStats"),

  // ─── Mutations ──────────────────────────────────────
  createNode: (params: CreateNodeParams): Promise<RpcResult<OutlineNode>> =>
    rpc.invoke("createNode", params),

  updateNode: (params: UpdateNodeParams): Promise<RpcResult<OutlineNode>> =>
    rpc.invoke("updateNode", params),

  moveNode: (params: MoveNodeParams): Promise<RpcResult<OutlineNode>> =>
    rpc.invoke("moveNode", params),

  indentNode: (params: IndentNodeParams): Promise<RpcResult<OutlineNode | null>> =>
    rpc.invoke("indentNode", params),

  outdentNode: (params: OutdentNodeParams): Promise<RpcResult<OutlineNode | null>> =>
    rpc.invoke("outdentNode", params),

  deleteNode: (params: DeleteNodeParams): Promise<RpcResult<void>> =>
    rpc.invoke("deleteNode", params),
};
```

---

## 9. Frontend — State Management

```typescript
// src/renderer/state/store.ts
import type { OutlineTreeNode, OutlineNode } from "../../main/rpc/types";
import { api } from "../rpc/api";

export interface AppState {
  tree: OutlineTreeNode[];
  zoomedNodeId: string | null;     // Current "root" for zoomed view
  breadcrumbs: OutlineNode[];       // Ancestors of zoomed node
  focusedNodeId: string | null;     // Currently focused/editing node
  searchQuery: string;
  searchResults: OutlineNode[];
  isSearching: boolean;
  loading: boolean;
}

type Listener = (state: AppState) => void;

class Store {
  private state: AppState = {
    tree: [],
    zoomedNodeId: null,
    breadcrumbs: [],
    focusedNodeId: null,
    searchQuery: "",
    searchResults: [],
    isSearching: false,
    loading: true,
  };

  private listeners: Set<Listener> = new Set();

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private update(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  // ─── Actions ──────────────────────────────────────────

  async loadTree(): Promise<void> {
    this.update({ loading: true });

    const parentId = this.state.zoomedNodeId;
    const result = await api.getSubtree({ parent_id: parentId });

    if (result.success) {
      this.update({ tree: result.data!, loading: false });

      // Load breadcrumbs if zoomed
      if (parentId) {
        const ancestors = await api.getAncestors(parentId);
        const zoomedNode = await api.getNode(parentId);
        if (ancestors.success && zoomedNode.success) {
          this.update({
            breadcrumbs: [...ancestors.data!, zoomedNode.data!],
          });
        }
      } else {
        this.update({ breadcrumbs: [] });
      }
    }
  }

  async createNode(afterId: string | null, parentId: string | null): Promise<OutlineNode | null> {
    const params = afterId
      ? { content: "", parent_id: parentId, insertAfterId: afterId }
      : { content: "", parent_id: parentId };

    const result = await api.createNode(params);
    if (result.success) {
      await this.loadTree();
      this.update({ focusedNodeId: result.data!.id });
      return result.data!;
    }
    return null;
  }

  async updateContent(id: string, content: string): Promise<void> {
    await api.updateNode({ id, content });
    // Optimistic: update local tree without full reload
    this.updateNodeInTree(id, { content });
  }

  async toggleExpanded(id: string): Promise<void> {
    const node = this.findNodeInTree(id);
    if (!node) return;

    const newExpanded = !node.is_expanded;
    await api.updateNode({ id, is_expanded: newExpanded });
    this.updateNodeInTree(id, { is_expanded: newExpanded });
  }

  async indentNode(id: string): Promise<void> {
    const result = await api.indentNode({ id });
    if (result.success && result.data) {
      await this.loadTree();
      this.update({ focusedNodeId: id });
    }
  }

  async outdentNode(id: string): Promise<void> {
    const result = await api.outdentNode({ id });
    if (result.success && result.data) {
      await this.loadTree();
      this.update({ focusedNodeId: id });
    }
  }

  async deleteNode(id: string): Promise<void> {
    await api.deleteNode({ id, deleteChildren: true });
    await this.loadTree();
  }

  async moveNode(
    id: string,
    newParentId: string | null,
    newPosition: number
  ): Promise<void> {
    await api.moveNode({ id, new_parent_id: newParentId, new_position: newPosition });
    await this.loadTree();
  }

  async zoomIn(nodeId: string): Promise<void> {
    this.update({ zoomedNodeId: nodeId });
    await this.loadTree();
  }

  async zoomOut(): Promise<void> {
    // Go up one level
    if (this.state.breadcrumbs.length > 1) {
      const parent = this.state.breadcrumbs[this.state.breadcrumbs.length - 2];
      this.update({ zoomedNodeId: parent.id });
    } else {
      this.update({ zoomedNodeId: null });
    }
    await this.loadTree();
  }

  async zoomToRoot(): Promise<void> {
    this.update({ zoomedNodeId: null });
    await this.loadTree();
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      this.update({ searchQuery: "", searchResults: [], isSearching: false });
      return;
    }

    this.update({ searchQuery: query, isSearching: true });
    const result = await api.search({ query, limit: 50 });

    if (result.success) {
      this.update({ searchResults: result.data!, isSearching: false });
    }
  }

  setFocusedNode(id: string | null): void {
    this.update({ focusedNodeId: id });
  }

  // ─── Helpers ──────────────────────────────────────────

  private findNodeInTree(
    id: string,
    nodes: OutlineTreeNode[] = this.state.tree
  ): OutlineTreeNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = this.findNodeInTree(id, node.children);
      if (found) return found;
    }
    return null;
  }

  private updateNodeInTree(
    id: string,
    updates: Partial<OutlineTreeNode>
  ): void {
    const updatedTree = this.deepUpdateTree(this.state.tree, id, updates);
    this.update({ tree: updatedTree });
  }

  private deepUpdateTree(
    nodes: OutlineTreeNode[],
    id: string,
    updates: Partial<OutlineTreeNode>
  ): OutlineTreeNode[] {
    return nodes.map((node) => {
      if (node.id === id) {
        return { ...node, ...updates };
      }
      if (node.children.length > 0) {
        return {
          ...node,
          children: this.deepUpdateTree(node.children, id, updates),
        };
      }
      return node;
    });
  }
}

export const store = new Store();
```

---

## 10. Frontend — Components

### 10.1 HTML Entry Point

```html
<!-- src/renderer/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Outliner</title>
  <link rel="stylesheet" href="./styles/main.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

### 10.2 App Bootstrap

```typescript
// src/renderer/index.ts
import { render } from "preact";
import { html } from "htm/preact";
import { App } from "./components/App";
import { store } from "./state/store";

// Initial data load
store.loadTree();

// Render app
render(html`<${App} />`, document.getElementById("app")!);
```

### 10.3 Root App Component

```typescript
// src/renderer/components/App.ts
import { useState, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { store, type AppState } from "../state/store";
import { Toolbar } from "./Toolbar";
import { Breadcrumb } from "./Breadcrumb";
import { OutlineTree } from "./OutlineTree";

export function App() {
  const [state, setState] = useState<AppState>(store.getState());

  useEffect(() => {
    return store.subscribe(setState);
  }, []);

  if (state.loading) {
    return html`<div class="loading">Loading...</div>`;
  }

  return html`
    <div class="app">
      <${Toolbar}
        searchQuery=${state.searchQuery}
        onSearch=${(q: string) => store.search(q)}
      />

      ${state.breadcrumbs.length > 0 && html`
        <${Breadcrumb}
          ancestors=${state.breadcrumbs}
          onNavigate=${(id: string | null) => id ? store.zoomIn(id) : store.zoomToRoot()}
        />
      `}

      ${state.searchQuery
        ? html`
          <div class="search-results">
            ${state.searchResults.map((node) => html`
              <div class="search-result" onClick=${() => { store.search(""); store.zoomIn(node.id); }}>
                ${node.content || "(empty)"}
              </div>
            `)}
          </div>
        `
        : html`
          <${OutlineTree}
            nodes=${state.tree}
            focusedNodeId=${state.focusedNodeId}
          />
        `
      }
    </div>
  `;
}
```

### 10.4 Outline Tree (Recursive)

```typescript
// src/renderer/components/OutlineTree.ts
import { html } from "htm/preact";
import type { OutlineTreeNode } from "../../main/rpc/types";
import { OutlineNode } from "./OutlineNode";

interface Props {
  nodes: OutlineTreeNode[];
  focusedNodeId: string | null;
}

export function OutlineTree({ nodes, focusedNodeId }: Props) {
  if (nodes.length === 0) {
    return html`
      <div class="empty-state">
        <p>No items yet. Press <kbd>Enter</kbd> to create one.</p>
      </div>
    `;
  }

  return html`
    <ul class="outline-tree" role="tree">
      ${nodes.map((node) => html`
        <${OutlineNode}
          key=${node.id}
          node=${node}
          focusedNodeId=${focusedNodeId}
        />
      `)}
    </ul>
  `;
}
```

### 10.5 Outline Node (Single Item)

```typescript
// src/renderer/components/OutlineNode.ts
import { useRef, useEffect, useCallback } from "preact/hooks";
import { html } from "htm/preact";
import type { OutlineTreeNode } from "../../main/rpc/types";
import { store } from "../state/store";
import { NodeEditor } from "./NodeEditor";
import { OutlineTree } from "./OutlineTree";

interface Props {
  node: OutlineTreeNode;
  focusedNodeId: string | null;
}

export function OutlineNode({ node, focusedNodeId }: Props) {
  const liRef = useRef<HTMLLIElement>(null);
  const isFocused = focusedNodeId === node.id;
  const hasChildren = node.children.length > 0;

  // ─── Keyboard handling ────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          // Create new sibling after this node
          store.createNode(node.id, node.parent_id);
          break;

        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            store.outdentNode(node.id);
          } else {
            store.indentNode(node.id);
          }
          break;

        case "Backspace":
          // Delete node if content is empty
          if (node.content === "") {
            e.preventDefault();
            store.deleteNode(node.id);
          }
          break;

        case "ArrowUp":
          if (e.altKey) {
            // Move node up (swap with previous sibling)
            e.preventDefault();
            if (node.position > 0) {
              store.moveNode(node.id, node.parent_id, node.position - 1);
            }
          }
          break;

        case "ArrowDown":
          if (e.altKey) {
            e.preventDefault();
            store.moveNode(node.id, node.parent_id, node.position + 1);
          }
          break;
      }
    },
    [node]
  );

  // ─── Bullet click → zoom ─────────────────────────
  const handleBulletClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        store.zoomIn(node.id);
      }
    },
    [node.id, hasChildren]
  );

  // ─── Expand/Collapse toggle ───────────────────────
  const handleToggle = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      store.toggleExpanded(node.id);
    },
    [node.id]
  );

  // ─── Drag and drop attributes ─────────────────────
  const dragProps = {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer!.setData("text/plain", node.id);
      e.dataTransfer!.effectAllowed = "move";
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const draggedId = e.dataTransfer!.getData("text/plain");
      if (draggedId && draggedId !== node.id) {
        // Drop as child of this node
        store.moveNode(draggedId, node.id, 0);
      }
    },
  };

  return html`
    <li
      ref=${liRef}
      class="outline-node ${isFocused ? "focused" : ""}"
      role="treeitem"
      aria-expanded=${hasChildren ? node.is_expanded : undefined}
      ...${dragProps}
    >
      <div class="node-row">
        <!-- Expand/Collapse toggle -->
        ${hasChildren
          ? html`
            <button
              class="toggle-btn ${node.is_expanded ? "expanded" : "collapsed"}"
              onClick=${handleToggle}
              aria-label=${node.is_expanded ? "Collapse" : "Expand"}
            >
              ▶
            </button>
          `
          : html`<span class="toggle-spacer" />`
        }

        <!-- Bullet -->
        <button
          class="bullet ${hasChildren ? "has-children" : ""}"
          onClick=${handleBulletClick}
          aria-label="Zoom into node"
        >
          •
        </button>

        <!-- Content editor -->
        <${NodeEditor}
          nodeId=${node.id}
          content=${node.content}
          isFocused=${isFocused}
          onKeyDown=${handleKeyDown}
          onChange=${(content: string) => store.updateContent(node.id, content)}
          onFocus=${() => store.setFocusedNode(node.id)}
        />
      </div>

      <!-- Children (recursive) -->
      ${hasChildren && node.is_expanded && html`
        <${OutlineTree}
          nodes=${node.children}
          focusedNodeId=${focusedNodeId}
        />
      `}
    </li>
  `;
}
```

### 10.6 Inline Node Editor

```typescript
// src/renderer/components/NodeEditor.ts
import { useRef, useEffect, useCallback } from "preact/hooks";
import { html } from "htm/preact";

interface Props {
  nodeId: string;
  content: string;
  isFocused: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
  onChange: (content: string) => void;
  onFocus: () => void;
}

// Debounce saves to avoid excessive SQLite writes
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function NodeEditor({
  nodeId,
  content,
  isFocused,
  onKeyDown,
  onChange,
  onFocus,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Debounce content saves (300ms)
  const debouncedSave = useCallback(
    debounce((text: string) => onChange(text), 300),
    [onChange]
  );

  // Auto-focus when this node becomes the focused node
  useEffect(() => {
    if (isFocused && editorRef.current) {
      editorRef.current.focus();

      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isFocused]);

  const handleInput = useCallback(
    (e: Event) => {
      const text = (e.target as HTMLDivElement).textContent || "";
      debouncedSave(text);
    },
    [debouncedSave]
  );

  return html`
    <div
      ref=${editorRef}
      class="node-editor"
      contenteditable="true"
      spellcheck="true"
      data-node-id=${nodeId}
      data-placeholder="Type something..."
      onInput=${handleInput}
      onKeyDown=${onKeyDown}
      onFocus=${onFocus}
      dangerouslySetInnerHTML=${{ __html: content || "" }}
    />
  `;
}
```

### 10.7 Breadcrumb

```typescript
// src/renderer/components/Breadcrumb.ts
import { html } from "htm/preact";
import type { OutlineNode } from "../../main/rpc/types";

interface Props {
  ancestors: OutlineNode[];
  onNavigate: (id: string | null) => void;
}

export function Breadcrumb({ ancestors, onNavigate }: Props) {
  return html`
    <nav class="breadcrumb" aria-label="Navigation">
      <button class="breadcrumb-item root" onClick=${() => onNavigate(null)}>
        Home
      </button>
      ${ancestors.map(
        (node, i) => html`
          <span class="breadcrumb-separator">›</span>
          <button
            class="breadcrumb-item ${i === ancestors.length - 1 ? "current" : ""}"
            onClick=${() => onNavigate(node.id)}
          >
            ${node.content || "(empty)"}
          </button>
        `
      )}
    </nav>
  `;
}
```

### 10.8 Toolbar

```typescript
// src/renderer/components/Toolbar.ts
import { useRef, useCallback } from "preact/hooks";
import { html } from "htm/preact";
import { store } from "../state/store";

interface Props {
  searchQuery: string;
  onSearch: (query: string) => void;
}

export function Toolbar({ searchQuery, onSearch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreateRoot = useCallback(() => {
    store.createNode(null, store.getState().zoomedNodeId);
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSearch("");
        inputRef.current?.blur();
      }
    },
    [onSearch]
  );

  return html`
    <header class="toolbar">
      <div class="toolbar-left">
        <h1 class="app-title">Outliner</h1>
      </div>
      <div class="toolbar-center">
        <input
          ref=${inputRef}
          class="search-input"
          type="text"
          placeholder="Search... (Ctrl+F)"
          value=${searchQuery}
          onInput=${(e: Event) => onSearch((e.target as HTMLInputElement).value)}
          onKeyDown=${handleSearchKeyDown}
        />
      </div>
      <div class="toolbar-right">
        <button class="btn" onClick=${handleCreateRoot}>+ New Item</button>
      </div>
    </header>
  `;
}
```

---

## 11. Styles

```css
/* src/renderer/styles/main.css */

/* ─── Reset & Base ──────────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #1a1a2e;
  --bg-secondary: #16213e;
  --text: #e0e0e0;
  --text-muted: #888;
  --accent: #4fc3f7;
  --accent-hover: #81d4fa;
  --border: #2a2a4a;
  --bullet: #4fc3f7;
  --bullet-parent: #fff;
  --focus-bg: rgba(79, 195, 247, 0.08);
  --font-mono: 'SF Mono', 'Fira Code', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  font-size: 15px;
  line-height: 1.6;
  overflow: hidden;
  height: 100vh;
}

#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ─── Toolbar ───────────────────────────────────────── */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag; /* Electrobun: make titlebar draggable */
}

.toolbar * {
  -webkit-app-region: no-drag;
}

.app-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent);
}

.search-input {
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 6px 12px;
  border-radius: 6px;
  width: 300px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--accent);
}

.btn {
  background: var(--accent);
  color: #000;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn:hover {
  background: var(--accent-hover);
}

/* ─── Breadcrumb ────────────────────────────────────── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.breadcrumb-item {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.breadcrumb-item:hover {
  background: var(--focus-bg);
  color: var(--accent);
}

.breadcrumb-item.current {
  color: var(--text);
  font-weight: 600;
}

.breadcrumb-separator {
  color: var(--text-muted);
}

/* ─── Outline Tree ──────────────────────────────────── */
.outline-tree {
  list-style: none;
  padding-left: 24px;
  flex: 1;
  overflow-y: auto;
  padding-top: 8px;
  padding-bottom: 100px;
}

.outline-tree:first-child {
  padding-left: 32px;
}

.outline-node {
  position: relative;
}

.node-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
  min-height: 28px;
  transition: background 0.15s;
}

.node-row:hover {
  background: var(--focus-bg);
}

.outline-node.focused > .node-row {
  background: var(--focus-bg);
}

/* ─── Toggle Button ─────────────────────────────────── */
.toggle-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  width: 20px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.toggle-btn.expanded {
  transform: rotate(90deg);
}

.toggle-btn:hover {
  color: var(--text);
}

.toggle-spacer {
  width: 20px;
  flex-shrink: 0;
}

/* ─── Bullet ────────────────────────────────────────── */
.bullet {
  background: none;
  border: none;
  color: var(--bullet);
  cursor: pointer;
  width: 20px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  border-radius: 50%;
}

.bullet.has-children {
  color: var(--bullet-parent);
}

.bullet:hover {
  background: var(--focus-bg);
}

/* ─── Node Editor ───────────────────────────────────── */
.node-editor {
  flex: 1;
  outline: none;
  padding: 2px 4px;
  min-height: 24px;
  line-height: 1.5;
  word-break: break-word;
}

.node-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
  pointer-events: none;
}

/* ─── Search Results ────────────────────────────────── */
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.search-result {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
}

.search-result:hover {
  background: var(--focus-bg);
}

/* ─── Loading & Empty ───────────────────────────────── */
.loading,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted);
}

.empty-state kbd {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 12px;
}

/* ─── Drag and Drop ─────────────────────────────────── */
.outline-node[draggable="true"] {
  cursor: grab;
}

.outline-node[draggable="true"]:active {
  cursor: grabbing;
  opacity: 0.5;
}
```

---

## 12. Keyboard Shortcuts Reference

| Shortcut | Action |
|---|---|
| `Enter` | Create new sibling after current node |
| `Tab` | Indent (make child of previous sibling) |
| `Shift + Tab` | Outdent (make sibling of parent) |
| `Backspace` (on empty) | Delete current node |
| `Alt + ↑` | Move node up among siblings |
| `Alt + ↓` | Move node down among siblings |
| Click bullet `•` | Zoom into node (make it the root view) |
| Breadcrumb click | Navigate to ancestor / home |
| `Ctrl/Cmd + F` | Focus search bar |
| `Escape` | Clear search / exit zoom |

---

## 13. Data Flow Summary

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER ACTION                               │
│                   (keystroke, click, drag)                       │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│   Component (OutlineNode)│  ← handles event
│   calls Store action     │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│   Store (state/store.ts) │  ← calls API
│   api.someMethod(params) │
└──────────────┬───────────┘
               │
               ▼  (Electrobun RPC)
┌──────────────────────────┐
│   RPC Handler            │  ← main process
│   (rpc/handlers.ts)      │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│   OutlineService         │  ← business logic
│   (services/)            │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│   NodeRepository         │  ← data access
│   (repository/)          │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│   SQLite (bun:sqlite)    │  ← persistent storage
│   outliner.db            │
└──────────────────────────┘
```

---

## Key Design Decisions

### Why SQLite via <code>bun:sqlite</code>

- **Zero-dependency**: `bun:sqlite` is built into Bun, no native modules needed
- **WAL mode**: Enables concurrent reads while writing, perfect for an interactive app
- **Prepared statements**: Cached and reused for maximum performance
- **FTS5**: Native full-text search without external dependencies
- **Transactions**: Atomic tree operations (move, indent, delete subtree)
- **Single file**: Easy backup, portable, no server needed

### Why adjacency list + position instead of nested sets or materialized paths? 

- **Simplest model** for an outliner where most operations are local (indent, outdent, move within siblings)
- **`parent_id` + `position`** gives O(1) lookups for children and O(n) reordering for siblings
- Recursive CTEs in SQLite handle subtree queries efficiently
- Nested sets would require expensive rebalancing on every insert/move

### Why soft delete?

- Enables future **undo/redo** by simply toggling `is_deleted`
- Enables a **trash/recently deleted** feature
- Data recovery is trivial
- Periodic hard-delete cleanup can run in background

### Why Preact + HTM instead of React/Vue?

- **3KB** runtime vs 40KB+ for React — fast startup in Electrobun's webview
- **HTM** = tagged template literals, no JSX build step needed
- Same hooks API as React (`useState`, `useEffect`, `useCallback`, `useRef`)
- Electrobun's renderer is a real browser view; lightweight frameworks perform best

---

This framework gives you a **fully structured, production-ready foundation**. 

---

Round 2: Do you know the plugin system design of Obsidian.md? it divide all plugins into built-in and third-party plugins and even many core functionalities of Obsidian is implemented by its built-in plugins so that you can choose to close them if you don't need them so that you can improve the start-up or load time of your app. Can you also design a similar plugin system for our outliner app here?

---

# Plugin System Design for Electrobun Outliner

## Design Philosophy

Inspired by Obsidian.md, our plugin system treats **almost every feature as a plugin** — including core outliner functionality. The app shell is minimal: it only provides the plugin loader, the database connection, the RPC bridge, and a bare UI frame. Everything else — the tree renderer, keyboard shortcuts, search, drag-and-drop, export — is a plugin.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electrobun Outliner                          │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      APP SHELL (minimal)                      │  │
│  │  • PluginManager (load, enable, disable, dependency resolve)  │  │
│  │  • Database connection (bun:sqlite)                           │  │
│  │  • RPC bridge (electrobun)                                    │  │
│  │  • EventBus (cross-plugin communication)                      │  │
│  │  • UI Frame (empty <div id="app">)                            │  │
│  └──────────────────────────┬─────────────────────────────────────┘  │
│                             │                                       │
│              ┌──────────────┴──────────────┐                        │
│              ▼                             ▼                        │
│  ┌─────────────────────┐     ┌──────────────────────────┐          │
│  │   BUILT-IN PLUGINS  │     │   THIRD-PARTY PLUGINS    │          │
│  │   (ship with app)   │     │   (user-installed)        │          │
│  │                     │     │                          │          │
│  │  core-tree-view     │     │  plugin-kanban-view      │          │
│  │  core-editor        │     │  plugin-pomodoro         │          │
│  │  core-keyboard      │     │  plugin-export-markdown  │          │
│  │  core-search        │     │  plugin-ai-completion    │          │
│  │  core-drag-drop     │     │  plugin-vim-keys         │          │
│  │  core-breadcrumb    │     │  plugin-custom-theme     │          │
│  │  core-zoom          │     │  ...                     │          │
│  │  core-node-ops      │     │                          │          │
│  │  core-toolbar       │     │                          │          │
│  │  core-undo-redo     │     │                          │          │
│  │  core-fts-search    │     │                          │          │
│  │  core-theme         │     │                          │          │
│  └─────────────────────┘     └──────────────────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Updated Project Structure

```
electrobun-outliner/
├── electrobun.config.ts
├── package.json
├── src/
│   ├── main/                              # Bun process
│   │   ├── index.ts                       # Minimal shell bootstrap
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   └── migrations.ts             # Only plugin-system tables
│   │   ├── plugin-system/
│   │   │   ├── PluginManager.ts          # Core plugin lifecycle manager
│   │   │   ├── PluginContext.ts          # API surface exposed to plugins
│   │   │   ├── PluginManifest.ts         # Manifest type definitions
│   │   │   ├── PluginStore.ts            # Enable/disable state persistence
│   │   │   ├── HookRegistry.ts          # Extension point (hook) system
│   │   │   ├── EventBus.ts              # Cross-plugin event bus
│   │   │   └── DependencyResolver.ts    # Topological sort for load order
│   │   ├── rpc/
│   │   │   ├── rpc-registry.ts           # Dynamic RPC handler registration
│   │   │   └── types.ts
│   │   └── plugins/                       # Built-in plugins (main-side)
│   │       ├── core-node-ops/
│   │       │   ├── manifest.ts
│   │       │   ├── index.ts              # Plugin entry
│   │       │   ├── migrations.ts         # outline_nodes table
│   │       │   ├── repository.ts
│   │       │   └── service.ts
│   │       ├── core-fts-search/
│   │       │   ├── manifest.ts
│   │       │   ├── index.ts
│   │       │   └── migrations.ts         # FTS5 tables
│   │       ├── core-undo-redo/
│   │       │   ├── manifest.ts
│   │       │   ├── index.ts
│   │       │   └── command-stack.ts
│   │       └── core-settings/
│   │           ├── manifest.ts
│   │           └── index.ts
│   │
│   └── renderer/                          # BrowserView
│       ├── index.html
│       ├── index.ts                       # Minimal shell bootstrap
│       ├── plugin-system/
│       │   ├── RendererPluginManager.ts  # Frontend plugin lifecycle
│       │   ├── RendererPluginContext.ts   # API surface for UI plugins
│       │   ├── UISlotRegistry.ts         # Named UI slots for injection
│       │   ├── CommandPalette.ts         # Plugin-registered commands
│       │   └── SettingsRegistry.ts       # Plugin settings panels
│       ├── shell/
│       │   ├── AppShell.ts               # Minimal frame with slots
│       │   └── PluginSettingsView.ts     # Enable/disable UI
│       └── plugins/                       # Built-in plugins (renderer-side)
│           ├── core-tree-view/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   ├── OutlineTree.ts
│           │   └── OutlineNode.ts
│           ├── core-editor/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── NodeEditor.ts
│           ├── core-keyboard/
│           │   ├── manifest.ts
│           │   └── index.ts
│           ├── core-search/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── SearchPanel.ts
│           ├── core-breadcrumb/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── Breadcrumb.ts
│           ├── core-zoom/
│           │   ├── manifest.ts
│           │   └── index.ts
│           ├── core-drag-drop/
│           │   ├── manifest.ts
│           │   └── index.ts
│           ├── core-toolbar/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── Toolbar.ts
│           ├── core-theme/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── default-theme.css
│           └── core-context-menu/
│               ├── manifest.ts
│               └── index.ts
│
├── plugins/                               # Third-party plugins directory
│   └── .gitkeep
│
└── data/
    └── outliner.db
```

---

## 1. Plugin Manifest & Types

```typescript
// src/main/plugin-system/PluginManifest.ts

/**
 * Every plugin — built-in or third-party — must declare a manifest.
 */
export interface PluginManifest {
  /** Unique plugin identifier (reverse-domain style) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Semantic version */
  version: string;

  /** Short description shown in settings */
  description: string;

  /** Plugin author */
  author: string;

  /**
   * Plugin category:
   * - "core": Ships with app, cannot be uninstalled (only disabled)
   * - "community": Third-party, can be installed/uninstalled
   */
  type: "core" | "community";

  /**
   * Where this plugin runs:
   * - "main": Only in Bun process (data, services)
   * - "renderer": Only in BrowserView (UI)
   * - "both": Has code in both processes
   */
  runtime: "main" | "renderer" | "both";

  /**
   * Plugin IDs this plugin depends on.
   * These will be loaded first. Circular deps are rejected.
   */
  dependencies?: string[];

  /**
   * Optional: plugins that, if present, this plugin integrates with.
   * Unlike dependencies, soft deps won't block loading if absent.
   */
  softDependencies?: string[];

  /**
   * If true, the plugin cannot be disabled (e.g., core-node-ops).
   * Only for absolutely essential core plugins.
   */
  essential?: boolean;

  /**
   * Minimum app version required. */
  minAppVersion?: string;

  /**
   * Whether enabled by default on first install. */
  enabledByDefault?: boolean;
}


// ─── Plugin Lifecycle Interfaces ──────────────────────

/**
 * Main-process plugin interface.
 * Plugins implement this to hook into the Bun/main process.
 */
export interface MainPlugin {
  manifest: PluginManifest;

  /**
   * Called when the plugin is loaded. Receive context for
   * registering RPC handlers, hooks, event listeners, DB migrations.
   */
  onLoad(context: MainPluginContext): Promise<void>;

  /**
   * Called when the plugin is being unloaded (disabled at runtime).
   * Clean up any resources, deregister handlers.
   */
  onUnload(): Promise<void>;
}

/**
 * Renderer-process plugin interface.
 * Plugins implement this to hook into the BrowserView UI.
 */
export interface RendererPlugin {
  manifest: PluginManifest;

  /**
   * Called when the plugin is loaded in the renderer.
   * Register UI slots, commands, keybindings, styles.
   */
  onLoad(context: RendererPluginContext): Promise<void>;

  /**
   * Called when the plugin is being unloaded.
   * Remove injected UI, clean up listeners.
   */
  onUnload(): Promise<void>;
}

// Forward declarations — defined in their own files
export interface MainPluginContext {}
export interface RendererPluginContext {}
```

---

## 2. Event Bus (Cross-Plugin Communication)

```typescript
// src/main/plugin-system/EventBus.ts

export type EventHandler = (...args: any[]) => void | Promise<void>;

/**
 * A typed event bus that allows plugins to communicate
 * without direct dependencies on each other.
 *
 * Works identically on both main and renderer sides.
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private onceHandlers = new Map<string, Set<EventHandler>>();

  /**
   * Subscribe to an event.
   * Returns an unsubscribe function.
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Subscribe to an event, auto-unsubscribe after first call.
   */
  once(event: string, handler: EventHandler): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);
  }

  /**
   * Emit an event to all subscribers.
   */
  async emit(event: string, ...args: any[]): Promise<void> {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        await handler(...args);
      }
    }

    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        await handler(...args);
      }
      this.onceHandlers.delete(event);
    }
  }

  /**
   * Remove all handlers for an event (used during plugin unload).
   */
  removeAllForEvent(event: string): void {
    this.handlers.delete(event);
    this.onceHandlers.delete(event);
  }

  /**
   * Remove a specific handler from all events (used during plugin unload).
   */
  removeHandler(handler: EventHandler): void {
    for (const [, handlers] of this.handlers) {
      handlers.delete(handler);
    }
    for (const [, handlers] of this.onceHandlers) {
      handlers.delete(handler);
    }
  }
}

// ─── Well-Known Events ────────────────────────────────
// These are documented event names that plugins can rely on.
// Plugins can also define their own custom events.

export const CoreEvents = {
  // Node lifecycle
  NODE_CREATED: "node:created",           // (node: OutlineNode)
  NODE_UPDATED: "node:updated",           // (node: OutlineNode, changes: Partial<OutlineNode>)
  NODE_DELETED: "node:deleted",           // (nodeId: string)
  NODE_MOVED: "node:moved",              // (node: OutlineNode, oldParent: string, newParent: string)
  NODE_INDENTED: "node:indented",         // (node: OutlineNode)
  NODE_OUTDENTED: "node:outdented",       // (node: OutlineNode)

  // Tree state
  TREE_LOADED: "tree:loaded",             // (tree: OutlineTreeNode[])
  ZOOM_CHANGED: "zoom:changed",           // (nodeId: string | null)

  // Plugin lifecycle
  PLUGIN_LOADED: "plugin:loaded",         // (pluginId: string)
  PLUGIN_UNLOADED: "plugin:unloaded",     // (pluginId: string)

  // UI events (renderer only)
  NODE_FOCUSED: "ui:node:focused",        // (nodeId: string | null)
  NODE_EXPANDED: "ui:node:expanded",      // (nodeId: string)
  NODE_COLLAPSED: "ui:node:collapsed",    // (nodeId: string)
  SEARCH_OPENED: "ui:search:opened",
  SEARCH_CLOSED: "ui:search:closed",

  // App lifecycle
  APP_READY: "app:ready",
  APP_WILL_QUIT: "app:will-quit",
} as const;
```

---

## 3. Hook Registry (Extension Points)

```typescript
// src/main/plugin-system/HookRegistry.ts

/**
 * Hooks are synchronous extension points that allow plugins to
 * modify data as it flows through the system.
 *
 * Unlike events (fire-and-forget), hooks are a pipeline:
 * each handler receives the output of the previous one.
 *
 * Example: A "markdown" plugin can hook into "node:render"
 * to transform node content before display.
 */

export type HookHandler<T = any> = (value: T, ...args: any[]) => T | Promise<T>;

export class HookRegistry {
  private hooks = new Map<string, { handler: HookHandler; priority: number; pluginId: string }[]>();

  /**
   * Register a hook handler.
   * @param hookName - The hook to tap into
   * @param handler - Transform function
   * @param priority - Lower = runs first (default 100)
   * @param pluginId - For cleanup on unload
   */
  register(
    hookName: string,
    handler: HookHandler,
    priority: number = 100,
    pluginId: string = "unknown"
  ): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    const list = this.hooks.get(hookName)!;
    list.push({ handler, priority, pluginId });
    list.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Run all handlers for a hook in pipeline fashion.
   * The output of each handler is passed as input to the next.
   */
  async apply<T>(hookName: string, initialValue: T, ...args: any[]): Promise<T> {
    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) return initialValue;

    let value = initialValue;
    for (const { handler } of handlers) {
      value = await handler(value, ...args);
    }
    return value;
  }

  /**
   * Synchronous version for performance-critical paths.
   */
  applySync<T>(hookName: string, initialValue: T, ...args: any[]): T {
    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) return initialValue;

    let value = initialValue;
    for (const { handler } of handlers) {
      const result = handler(value, ...args);
      if (result instanceof Promise) {
        throw new Error(`Hook "${hookName}" handler returned Promise in sync context`);
      }
      value = result;
    }
    return value;
  }

  /**
   * Remove all hooks registered by a specific plugin.
   */
  removeByPlugin(pluginId: string): void {
    for (const [hookName, handlers] of this.hooks) {
      const filtered = handlers.filter((h) => h.pluginId !== pluginId);
      if (filtered.length === 0) {
        this.hooks.delete(hookName);
      } else {
        this.hooks.set(hookName, filtered);
      }
    }
  }
}

// ─── Well-Known Hooks ─────────────────────────────────

export const CoreHooks = {
  /**
   * Transform node content before saving to DB.
   * Pipeline: string → string
   */
  NODE_CONTENT_BEFORE_SAVE: "node:content:beforeSave",

  /**
   * Transform node content before rendering in UI.
   * Pipeline: string → string (or HTML string)
   */
  NODE_CONTENT_RENDER: "node:content:render",

  /**
   * Modify the tree structure before sending to renderer.
   * Pipeline: OutlineTreeNode[] → OutlineTreeNode[]
   */
  TREE_BEFORE_RENDER: "tree:beforeRender",

  /**
   * Add extra context menu items for a node.
   * Pipeline: MenuItem[] → MenuItem[]
   */
  NODE_CONTEXT_MENU: "node:contextMenu",

  /**
   * Modify node data before creation.
   * Pipeline: CreateNodeParams → CreateNodeParams
   */
  NODE_BEFORE_CREATE: "node:beforeCreate",

  /**
   * Modify node data before deletion. Return null to cancel.
   * Pipeline: DeleteNodeParams → DeleteNodeParams | null
   */
  NODE_BEFORE_DELETE: "node:beforeDelete",

  /**
   * Add items to the toolbar.
   * Pipeline: ToolbarItem[] → ToolbarItem[]
   */
  TOOLBAR_ITEMS: "toolbar:items",

  /**
   * Add CSS class names to a node's container.
   * Pipeline: string[] → string[]
   */
  NODE_CSS_CLASSES: "node:cssClasses",

  /**
   * Add items to the status bar.
   * Pipeline: StatusBarItem[] → StatusBarItem[]
   */
  STATUSBAR_ITEMS: "statusbar:items",
} as const;
```

---

## 4. Plugin Context (API Surface Exposed to Plugins)

### 4.1 Main Process Context

```typescript
// src/main/plugin-system/PluginContext.ts

import { Database } from "bun:sqlite";
import { EventBus } from "./EventBus";
import { HookRegistry } from "./HookRegistry";
import type { PluginManifest } from "./PluginManifest";

/**
 * The API surface that main-process plugins receive.
 * This is the ONLY way plugins interact with the app core.
 * Plugins never import from other plugins directly.
 */
export class MainPluginContext {
  readonly pluginId: string;
  readonly pluginDataDir: string;

  constructor(
    manifest: PluginManifest,
    private db: Database,
    private eventBus: EventBus,
    private hookRegistry: HookRegistry,
    private rpcRegistry: RpcHandlerRegistry,
    private settingsStore: PluginSettingsStore,
    appDataDir: string
  ) {
    this.pluginId = manifest.id;
    this.pluginDataDir = `${appDataDir}/plugins/${manifest.id}`;
  }

  // ─── Database Access ────────────────────────────────

  /**
   * Get the shared SQLite database instance.
   * Plugins can create their own tables (prefixed with plugin id).
   */
  getDatabase(): Database {
    return this.db;
  }

  /**
   * Run a migration for this plugin.
   * Migrations are tracked per-plugin in _plugin_migrations table.
   */
  runMigration(version: number, name: string, sql: string): void {
    const applied = this.db
      .query(
        "SELECT version FROM _plugin_migrations WHERE plugin_id = ? AND version = ?"
      )
      .get(this.pluginId, version);

    if (applied) return;

    this.db.transaction(() => {
      const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        this.db.run(stmt);
      }
      this.db.run(
        "INSERT INTO _plugin_migrations (plugin_id, version, name, applied_at) VALUES (?, ?, ?, ?)",
        [this.pluginId, version, name, Date.now()]
      );
    })();
  }

  // ─── Events ─────────────────────────────────────────

  /**
   * Subscribe to an event. Automatically cleaned up on unload.
   */
  on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  /**
   * Emit an event for other plugins to receive.
   */
  emit(event: string, ...args: any[]): Promise<void> {
    return this.eventBus.emit(event, ...args);
  }

  // ─── Hooks ──────────────────────────────────────────

  /**
   * Register a hook handler to transform data in a pipeline.
   */
  addHook<T>(hookName: string, handler: (value: T, ...args: any[]) => T, priority?: number): void {
    this.hookRegistry.register(hookName, handler, priority, this.pluginId);
  }

  /**
   * Apply a hook pipeline. Used by plugins that define extension points.
   */
  applyHook<T>(hookName: string, initialValue: T, ...args: any[]): Promise<T> {
    return this.hookRegistry.apply(hookName, initialValue, ...args);
  }

  applyHookSync<T>(hookName: string, initialValue: T, ...args: any[]): T {
    return this.hookRegistry.applySync(hookName, initialValue, ...args);
  }

  // ─── RPC Handlers ──────────────────────────────────

  /**
   * Register an RPC handler that the renderer can call.
   * Handler name is auto-prefixed: `pluginId:handlerName`
   * Core plugins can opt out of prefixing.
   */
  registerRpcHandler(
    name: string,
    handler: (params: any) => any | Promise<any>,
    options?: { noPrefix?: boolean }
  ): void {
    const fullName = options?.noPrefix ? name : `${this.pluginId}:${name}`;
    this.rpcRegistry.register(fullName, handler, this.pluginId);
  }

  // ─── Settings ───────────────────────────────────────

  /**
   * Get a setting value for this plugin.
   */
  getSetting<T>(key: string, defaultValue: T): T {
    return this.settingsStore.get(this.pluginId, key, defaultValue);
  }

  /**
   * Set a setting value for this plugin.
   */
  setSetting<T>(key: string, value: T): void {
    this.settingsStore.set(this.pluginId, key, value);
  }

  // ─── Logging ────────────────────────────────────────

  log(...args: any[]): void {
    console.log(`[${this.pluginId}]`, ...args);
  }

  warn(...args: any[]): void {
    console.warn(`[${this.pluginId}]`, ...args);
  }

  error(...args: any[]): void {
    console.error(`[${this.pluginId}]`, ...args);
  }
}


// ─── Supporting Types ─────────────────────────────────

export class RpcHandlerRegistry {
  private handlers = new Map<string, { handler: Function; pluginId: string }>();

  register(name: string, handler: Function, pluginId: string): void {
    if (this.handlers.has(name)) {
      console.warn(`RPC handler "${name}" is being overridden by plugin "${pluginId}"`);
    }
    this.handlers.set(name, { handler, pluginId });
  }

  get(name: string): Function | undefined {
    return this.handlers.get(name)?.handler;
  }

  removeByPlugin(pluginId: string): void {
    for (const [name, entry] of this.handlers) {
      if (entry.pluginId === pluginId) {
        this.handlers.delete(name);
      }
    }
  }

  getAllHandlers(): Map<string, Function> {
    const result = new Map<string, Function>();
    for (const [name, entry] of this.handlers) {
      result.set(name, entry.handler);
    }
    return result;
  }
}

export class PluginSettingsStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS _plugin_settings (
        plugin_id TEXT NOT NULL,
        key       TEXT NOT NULL,
        value     TEXT,
        PRIMARY KEY (plugin_id, key)
      )
    `);
  }

  get<T>(pluginId: string, key: string, defaultValue: T): T {
    const row = this.db
      .query("SELECT value FROM _plugin_settings WHERE plugin_id = ? AND key = ?")
      .get(pluginId, key) as { value: string } | null;

    if (!row) return defaultValue;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  set<T>(pluginId: string, key: string, value: T): void {
    this.db.run(
      `INSERT OR REPLACE INTO _plugin_settings (plugin_id, key, value) VALUES (?, ?, ?)`,
      [pluginId, key, JSON.stringify(value)]
    );
  }

  removeByPlugin(pluginId: string): void {
    this.db.run("DELETE FROM _plugin_settings WHERE plugin_id = ?", [pluginId]);
  }
}
```

### 4.2 Renderer Process Context

```typescript
// src/renderer/plugin-system/RendererPluginContext.ts

import { EventBus } from "../../main/plugin-system/EventBus";
import { HookRegistry } from "../../main/plugin-system/HookRegistry";
import type { PluginManifest } from "../../main/plugin-system/PluginManifest";
import type { UISlotRegistry } from "./UISlotRegistry";
import type { CommandRegistry } from "./CommandPalette";
import type { SettingsRegistry } from "./SettingsRegistry";
import type { ComponentType } from "preact";

/**
 * API surface for renderer-side plugins.
 */
export class RendererPluginContext {
  readonly pluginId: string;

  constructor(
    manifest: PluginManifest,
    private eventBus: EventBus,
    private hookRegistry: HookRegistry,
    private uiSlots: UISlotRegistry,
    private commands: CommandRegistry,
    private settings: SettingsRegistry,
    private rpcInvoke: (method: string, params?: any) => Promise<any>
  ) {
    this.pluginId = manifest.id;
  }

  // ─── Events (same as main) ─────────────────────────

  on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  emit(event: string, ...args: any[]): Promise<void> {
    return this.eventBus.emit(event, ...args);
  }

  // ─── Hooks (same as main) ──────────────────────────

  addHook<T>(hookName: string, handler: (value: T, ...args: any[]) => T, priority?: number): void {
    this.hookRegistry.register(hookName, handler, priority, this.pluginId);
  }

  applyHook<T>(hookName: string, initialValue: T, ...args: any[]): Promise<T> {
    return this.hookRegistry.apply(hookName, initialValue, ...args);
  }

  // ─── RPC (call main process) ───────────────────────

  /**
   * Invoke an RPC method on the main process.
   */
  rpc(method: string, params?: any): Promise<any> {
    return this.rpcInvoke(method, params);
  }

  // ─── UI Slot Injection ─────────────────────────────

  /**
   * Register a Preact component into a named UI slot.
   *
   * Slots are defined by the shell and other plugins:
   * "toolbar:left", "toolbar:right", "sidebar:top",
   * "node:before", "node:after", "node:badge",
   * "statusbar:left", "statusbar:right", etc.
   */
  registerUISlot(
    slotName: string,
    component: ComponentType<any>,
    options?: { order?: number; props?: Record<string, any> }
  ): () => void {
    return this.uiSlots.register(slotName, component, {
      pluginId: this.pluginId,
      order: options?.order ?? 100,
      props: options?.props,
    });
  }

  // ─── Commands ──────────────────────────────────────

  /**
   * Register a command that appears in the command palette
   * and can be bound to keyboard shortcuts.
   */
  registerCommand(command: {
    id: string;
    name: string;
    icon?: string;
    shortcut?: string;        // e.g. "Ctrl+Shift+P"
    execute: () => void | Promise<void>;
    isEnabled?: () => boolean; // dynamic enable/disable
  }): void {
    this.commands.register({
      ...command,
      id: `${this.pluginId}:${command.id}`,
      pluginId: this.pluginId,
    });
  }

  // ─── Settings Panel ────────────────────────────────

  /**
   * Register a settings panel for this plugin.
   * Displayed in the plugin settings view.
   */
  registerSettingsPanel(component: ComponentType<any>): void {
    this.settings.registerPanel(this.pluginId, component);
  }

  // ─── Styles ────────────────────────────────────────

  /**
   * Inject a CSS stylesheet. Returns cleanup function.
   */
  injectCSS(css: string): () => void {
    const style = document.createElement("style");
    style.setAttribute("data-plugin", this.pluginId);
    style.textContent = css;
    document.head.appendChild(style);

    return () => style.remove();
  }

  /**
   * Inject a CSS file URL. Returns cleanup function.
   */
  injectCSSFile(url: string): () => void {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.setAttribute("data-plugin", this.pluginId);
    document.head.appendChild(link);

    return () => link.remove();
  }
}
```

---

## 5. UI Slot Registry

```typescript
// src/renderer/plugin-system/UISlotRegistry.ts

import type { ComponentType } from "preact";

export interface SlotEntry {
  component: ComponentType<any>;
  pluginId: string;
  order: number;
  props?: Record<string, any>;
}

type SlotChangeListener = (slotName: string) => void;

/**
 * Named UI insertion points. The app shell and core plugins define slots,
 * and any plugin can inject components into them.
 *
 * Think of it like named <slot> elements in Web Components,
 * but dynamically managed by plugins.
 */
export class UISlotRegistry {
  private slots = new Map<string, SlotEntry[]>();
  private listeners = new Set<SlotChangeListener>();

  /**
   * Register a component into a named slot.
   * Returns an unregister function.
   */
  register(
    slotName: string,
    component: ComponentType<any>,
    options: { pluginId: string; order?: number; props?: Record<string, any> }
  ): () => void {
    if (!this.slots.has(slotName)) {
      this.slots.set(slotName, []);
    }

    const entry: SlotEntry = {
      component,
      pluginId: options.pluginId,
      order: options.order ?? 100,
      props: options.props,
    };

    const list = this.slots.get(slotName)!;
    list.push(entry);
    list.sort((a, b) => a.order - b.order);

    this.notifyChange(slotName);

    return () => {
      const idx = list.indexOf(entry);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.notifyChange(slotName);
      }
    };
  }

  /**
   * Get all components for a slot, sorted by order.
   */
  getSlot(slotName: string): SlotEntry[] {
    return this.slots.get(slotName) ?? [];
  }

  /**
   * Remove all entries from a specific plugin.
   */
  removeByPlugin(pluginId: string): void {
    for (const [slotName, entries] of this.slots) {
      const filtered = entries.filter((e) => e.pluginId !== pluginId);
      this.slots.set(slotName, filtered);
      if (filtered.length !== entries.length) {
        this.notifyChange(slotName);
      }
    }
  }

  /**
   * Subscribe to slot changes (triggers re-render).
   */
  onChange(listener: SlotChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyChange(slotName: string): void {
    for (const listener of this.listeners) {
      listener(slotName);
    }
  }
}


// ─── Well-Known Slot Names ────────────────────────────

export const UISlots = {
  // Top-level layout
  TOOLBAR_LEFT: "toolbar:left",
  TOOLBAR_CENTER: "toolbar:center",
  TOOLBAR_RIGHT: "toolbar:right",

  // Main content area
  MAIN_CONTENT: "main:content",         // The primary view (tree, etc.)
  SIDEBAR_LEFT: "sidebar:left",
  SIDEBAR_RIGHT: "sidebar:right",

  // Node-level injection points
  NODE_BEFORE: "node:before",           // Before the node row
  NODE_AFTER: "node:after",             // After the node row
  NODE_BADGE: "node:badge",             // Inline badges next to content
  NODE_ACTIONS: "node:actions",         // Action buttons on hover

  // Bottom
  STATUSBAR_LEFT: "statusbar:left",
  STATUSBAR_CENTER: "statusbar:center",
  STATUSBAR_RIGHT: "statusbar:right",

  // Overlays
  MODAL: "modal",
  COMMAND_PALETTE: "command-palette",
} as const;
```

---

## 6. Dependency Resolver

```typescript
// src/main/plugin-system/DependencyResolver.ts

import type { PluginManifest } from "./PluginManifest";

export interface ResolveResult {
  /** Plugins in correct load order */
  loadOrder: string[];
  /** Plugins that couldn't be loaded due to missing deps */
  unresolvable: { pluginId: string; missingDeps: string[] }[];
  /** Circular dependency chains detected */
  circularDeps: string[][];
}

/**
 * Topological sort of plugins based on their dependency declarations.
 * Ensures plugins are loaded after their dependencies.
 */
export function resolveDependencies(
  manifests: Map<string, PluginManifest>,
  enabledPluginIds: Set<string>
): ResolveResult {
  const result: ResolveResult = {
    loadOrder: [],
    unresolvable: [],
    circularDeps: [],
  };

  // Filter to only enabled plugins
  const active = new Map<string, PluginManifest>();
  for (const [id, manifest] of manifests) {
    if (enabledPluginIds.has(id)) {
      active.set(id, manifest);
    }
  }

  // Check for missing dependencies
  for (const [id, manifest] of active) {
    const missing = (manifest.dependencies ?? []).filter(
      (depId) => !active.has(depId)
    );
    if (missing.length > 0) {
      result.unresolvable.push({ pluginId: id, missingDeps: missing });
    }
  }

  // Remove unresolvable from active set
  const unresolvableIds = new Set(result.unresolvable.map((u) => u.pluginId));
  for (const id of unresolvableIds) {
    active.delete(id);
  }

  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>(); // dependency → dependents

  for (const [id] of active) {
    inDegree.set(id, 0);
    adjList.set(id, []);
  }

  for (const [id, manifest] of active) {
    const deps = (manifest.dependencies ?? []).filter((d) => active.has(d));
    inDegree.set(id, deps.length);
    for (const dep of deps) {
      adjList.get(dep)!.push(id);
    }
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const dependent of adjList.get(current) ?? []) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // If sorted doesn't include all active, we have circular deps
  if (sorted.length < active.size) {
    const inCycle = new Set<string>();
    for (const [id] of active) {
      if (!sorted.includes(id)) {
        inCycle.add(id);
      }
    }
    result.circularDeps.push([...inCycle]);
  }

  result.loadOrder = sorted;
  return result;
}
```

---

## 7. Plugin Manager (Main Process)

```typescript
// src/main/plugin-system/PluginManager.ts

import { Database } from "bun:sqlite";
import type { MainPlugin, PluginManifest } from "./PluginManifest";
import { MainPluginContext, RpcHandlerRegistry, PluginSettingsStore } from "./PluginContext";
import { EventBus, CoreEvents } from "./EventBus";
import { HookRegistry } from "./HookRegistry";
import { resolveDependencies } from "./DependencyResolver";
import path from "path";

export class PluginManager {
  private manifests = new Map<string, PluginManifest>();
  private plugins = new Map<string, MainPlugin>();
  private loadedPlugins = new Set<string>();
  private enabledPlugins = new Set<string>();

  readonly eventBus = new EventBus();
  readonly hookRegistry = new HookRegistry();
  readonly rpcRegistry: RpcHandlerRegistry;
  readonly settingsStore: PluginSettingsStore;

  private db: Database;
  private appDataDir: string;

  constructor(db: Database, appDataDir: string) {
    this.db = db;
    this.appDataDir = appDataDir;
    this.rpcRegistry = new RpcHandlerRegistry();
    this.settingsStore = new PluginSettingsStore(db);

    // Create plugin system tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS _plugin_migrations (
        plugin_id  TEXT NOT NULL,
        version    INTEGER NOT NULL,
        name       TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        PRIMARY KEY (plugin_id, version)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS _plugin_state (
        plugin_id TEXT PRIMARY KEY,
        enabled   INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Load enabled state from DB
    this.loadEnabledState();
  }

  private loadEnabledState(): void {
    const rows = this.db
      .query("SELECT plugin_id, enabled FROM _plugin_state")
      .all() as { plugin_id: string; enabled: number }[];

    for (const row of rows) {
      if (row.enabled) {
        this.enabledPlugins.add(row.plugin_id);
      }
    }
  }

  // ─── Registration ───────────────────────────────────

  /**
   * Register a plugin (built-in or discovered).
   * Does NOT load it yet.
   */
  register(plugin: MainPlugin): void {
    const { manifest } = plugin;
    this.manifests.set(manifest.id, manifest);
    this.plugins.set(manifest.id, plugin);

    // If no state stored yet, use the default
    const stored = this.db
      .query("SELECT enabled FROM _plugin_state WHERE plugin_id = ?")
      .get(manifest.id) as { enabled: number } | null;

    if (!stored) {
      const enabled = manifest.essential || (manifest.enabledByDefault !== false);
      this.db.run(
        "INSERT INTO _plugin_state (plugin_id, enabled) VALUES (?, ?)",
        [manifest.id, enabled ? 1 : 0]
      );
      if (enabled) {
        this.enabledPlugins.add(manifest.id);
      }
    }
  }

  // ─── Discovery ──────────────────────────────────────

  /**
   * Discover and register third-party plugins from the plugins directory.
   */
  async discoverCommunityPlugins(pluginsDir: string): Promise<void> {
    const fs = await import("fs");

    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
      return;
    }

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = path.join(pluginsDir, entry.name);
      const manifestPath = path.join(pluginPath, "manifest.ts");
      const indexPath = path.join(pluginPath, "index.ts");

      if (!fs.existsSync(indexPath)) continue;

      try {
        const pluginModule = await import(indexPath);

        if (pluginModule.default && pluginModule.default.manifest) {
          const plugin = pluginModule.default as MainPlugin;
          plugin.manifest.type = "community"; // enforce
          this.register(plugin);
        }
      } catch (err) {
        console.error(`Failed to load community plugin from ${pluginPath}:`, err);
      }
    }
  }

  // ─── Lifecycle ──────────────────────────────────────

  /**
   * Load all enabled plugins in dependency order.
   */
  async loadAll(): Promise<void> {
    const resolution = resolveDependencies(this.manifests, this.enabledPlugins);

    // Log warnings
    for (const unresolvable of resolution.unresolvable) {
      console.warn(
        `Plugin "${unresolvable.pluginId}" skipped: missing dependencies [${unresolvable.missingDeps.join(", ")}]`
      );
    }

    for (const cycle of resolution.circularDeps) {
      console.error(`Circular dependency detected: ${cycle.join(" → ")}`);
    }

    // Load in resolved order
    for (const pluginId of resolution.loadOrder) {
      await this.loadPlugin(pluginId);
    }

    await this.eventBus.emit(CoreEvents.APP_READY);
  }

  /**
   * Load a single plugin.
   */
  private async loadPlugin(pluginId: string): Promise<void> {
    if (this.loadedPlugins.has(pluginId)) return;

    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    const context = new MainPluginContext(
      plugin.manifest,
      this.db,
      this.eventBus,
      this.hookRegistry,
      this.rpcRegistry,
      this.settingsStore,
      this.appDataDir
    );

    try {
      await plugin.onLoad(context);
      this.loadedPlugins.add(pluginId);
      console.log(`✓ Loaded plugin: ${plugin.manifest.name} (${pluginId})`);
      await this.eventBus.emit(CoreEvents.PLUGIN_LOADED, pluginId);
    } catch (err) {
      console.error(`✗ Failed to load plugin "${pluginId}":`, err);
    }
  }

  /**
   * Enable a plugin at runtime.
   */
  async enablePlugin(pluginId: string): Promise<boolean> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return false;

    // Check dependencies are enabled
    for (const depId of manifest.dependencies ?? []) {
      if (!this.loadedPlugins.has(depId)) {
        console.error(`Cannot enable "${pluginId}": dependency "${depId}" is not loaded`);
        return false;
      }
    }

    this.enabledPlugins.add(pluginId);
    this.db.run("UPDATE _plugin_state SET enabled = 1 WHERE plugin_id = ?", [pluginId]);

    await this.loadPlugin(pluginId);
    return true;
  }

  /**
   * Disable a plugin at runtime.
   */
  async disablePlugin(pluginId: string): Promise<boolean> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return false;

    if (manifest.essential) {
      console.warn(`Cannot disable essential plugin "${pluginId}"`);
      return false;
    }

    // Check if any loaded plugin depends on this one
    for (const [id, m] of this.manifests) {
      if (this.loadedPlugins.has(id) && m.dependencies?.includes(pluginId)) {
        console.error(`Cannot disable "${pluginId}": plugin "${id}" depends on it`);
        return false;
      }
    }

    // Unload
    const plugin = this.plugins.get(pluginId);
    if (plugin && this.loadedPlugins.has(pluginId)) {
      try {
        await plugin.onUnload();
      } catch (err) {
        console.error(`Error unloading plugin "${pluginId}":`, err);
      }

      // Clean up all registrations
      this.rpcRegistry.removeByPlugin(pluginId);
      this.hookRegistry.removeByPlugin(pluginId);
      this.loadedPlugins.delete(pluginId);
    }

    this.enabledPlugins.delete(pluginId);
    this.db.run("UPDATE _plugin_state SET enabled = 0 WHERE plugin_id = ?", [pluginId]);

    await this.eventBus.emit(CoreEvents.PLUGIN_UNLOADED, pluginId);
    return true;
  }

  /**
   * Get manifest + state for all registered plugins (for settings UI).
   */
  getPluginList(): Array<PluginManifest & { enabled: boolean; loaded: boolean }> {
    const list: Array<PluginManifest & { enabled: boolean; loaded: boolean }> = [];

    for (const [id, manifest] of this.manifests) {
      list.push({
        ...manifest,
        enabled: this.enabledPlugins.has(id),
        loaded: this.loadedPlugins.has(id),
      });
    }

    return list.sort((a, b) => {
      // Core first, then alphabetical
      if (a.type !== b.type) return a.type === "core" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async shutdown(): Promise<void> {
    await this.eventBus.emit(CoreEvents.APP_WILL_QUIT);

    // Unload in reverse order
    const loadOrder = [...this.loadedPlugins];
    for (const pluginId of loadOrder.reverse()) {
      const plugin = this.plugins.get(pluginId);
      if (plugin) {
        try {
          await plugin.onUnload();
        } catch (err) {
          console.error(`Error unloading "${pluginId}":`, err);
        }
      }
    }

    this.loadedPlugins.clear();
  }
}
```

---

## 8. Example Built-In Plugins

### 8.1 `core-node-ops` — The Essential Data Layer

```typescript
// src/main/plugins/core-node-ops/manifest.ts
import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-node-ops",
  name: "Core: Node Operations",
  version: "1.0.0",
  description: "Provides the outline node data model, CRUD operations, and tree queries. This is the foundation all other plugins build on.",
  author: "Outliner Team",
  type: "core",
  runtime: "main",
  essential: true,           // Cannot be disabled
  enabledByDefault: true,
  dependencies: [],          // No dependencies — this IS the foundation
};
```

```typescript
// src/main/plugins/core-node-ops/index.ts
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import { NodeRepository } from "./repository";
import { NodeService } from "./service";
import { CoreEvents } from "../../plugin-system/EventBus";
import { CoreHooks } from "../../plugin-system/HookRegistry";

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    // ─── Run migrations ─────────────────────────────
    ctx.runMigration(1, "create_outline_nodes", `
      CREATE TABLE IF NOT EXISTS outline_nodes (
        id          TEXT PRIMARY KEY,
        content     TEXT NOT NULL DEFAULT '',
        parent_id   TEXT,
        position    INTEGER NOT NULL DEFAULT 0,
        is_expanded INTEGER NOT NULL DEFAULT 1,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES outline_nodes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON outline_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_position ON outline_nodes(parent_id, position);
      CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON outline_nodes(is_deleted)
    `);

    // ─── Initialize repository & service ────────────
    const db = ctx.getDatabase();
    const repo = new NodeRepository(db);
    const service = new NodeService(repo, ctx);

    // ─── Register RPC handlers (no prefix for core) ─
    ctx.registerRpcHandler("getFullTree", () => service.getFullTree(), { noPrefix: true });
    ctx.registerRpcHandler("getSubtree", (p) => service.getSubtree(p), { noPrefix: true });
    ctx.registerRpcHandler("getNode", (p) => service.getNode(p.id), { noPrefix: true });
    ctx.registerRpcHandler("getAncestors", (p) => service.getAncestors(p.nodeId), { noPrefix: true });
    ctx.registerRpcHandler("getStats", () => service.getStats(), { noPrefix: true });

    ctx.registerRpcHandler("createNode", async (params) => {
      // Apply hooks before creation
      const processed = await ctx.applyHook(CoreHooks.NODE_BEFORE_CREATE, params);
      const result = service.createNode(processed);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_CREATED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("updateNode", async (params) => {
      const result = service.updateNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_UPDATED, result.data, params);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("moveNode", async (params) => {
      const result = service.moveNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_MOVED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("indentNode", async (params) => {
      const result = service.indentNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_INDENTED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("outdentNode", async (params) => {
      const result = service.outdentNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_OUTDENTED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("deleteNode", async (params) => {
      const processed = await ctx.applyHook(CoreHooks.NODE_BEFORE_DELETE, params);
      if (processed === null) return { success: false, error: "Deletion cancelled by hook" };
      const result = service.deleteNode(processed);
      if (result.success) {
        await ctx.emit(CoreEvents.NODE_DELETED, params.id);
      }
      return result;
    }, { noPrefix: true });

    // ─── Seed data if empty ─────────────────────────
    if (repo.getNodeCount() === 0) {
      service.seedInitialData();
    }

    ctx.log("Node operations ready");
  },

  async onUnload() {
    // Essential plugin — this should never actually be called
  },
};

export default plugin;
```

### 8.2 `core-fts-search` — Full-Text Search

```typescript
// src/main/plugins/core-fts-search/manifest.ts
import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-fts-search",
  name: "Core: Full-Text Search",
  version: "1.0.0",
  description: "Adds FTS5-powered full-text search across all nodes. Disable if you don't need search to save memory.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: false,           // CAN be disabled!
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
```

```typescript
// src/main/plugins/core-fts-search/index.ts
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    ctx.runMigration(1, "create_fts_tables", `
      CREATE VIRTUAL TABLE IF NOT EXISTS outline_nodes_fts USING fts5(
        content,
        content='outline_nodes',
        content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS outline_nodes_fts_ai AFTER INSERT ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;
      CREATE TRIGGER IF NOT EXISTS outline_nodes_fts_ad AFTER DELETE ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(outline_nodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END;
      CREATE TRIGGER IF NOT EXISTS outline_nodes_fts_au AFTER UPDATE OF content ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(outline_nodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO outline_nodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);

    const db = ctx.getDatabase();

    ctx.registerRpcHandler("search", (params: { query: string; limit?: number }) => {
      try {
        const ftsQuery = params.query
          .split(/\s+/)
          .map((term) => `"${term}"*`)
          .join(" AND ");

        const results = db.query(`
          SELECT n.* FROM outline_nodes n
          JOIN outline_nodes_fts fts ON n.rowid = fts.rowid
          WHERE outline_nodes_fts MATCH ? AND n.is_deleted = 0
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, params.limit ?? 50);

        return { success: true, data: results };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }, { noPrefix: true });

    ctx.log("Full-text search ready");
  },

  async onUnload() {
    // RPC handler auto-cleaned by PluginManager
    // FTS tables remain (data preservation) but won't be used
  },
};

export default plugin;
```

### 8.3 `core-tree-view` — The Outliner UI (Renderer Plugin)

```typescript
// src/renderer/plugins/core-tree-view/manifest.ts
import type { PluginManifest } from "../../../main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-tree-view",
  name: "Core: Tree View",
  version: "1.0.0",
  description: "The main outliner tree view. Renders the hierarchical list of nodes.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: true,
  enabledByDefault: true,
  dependencies: ["core-node-ops", "core-editor"],
};
```

```typescript
// src/renderer/plugins/core-tree-view/index.ts
import type { RendererPlugin } from "../../../main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { UISlots } from "../../plugin-system/UISlotRegistry";
import { manifest } from "./manifest";
import { OutlineTree } from "./OutlineTree";
import { treeViewCSS } from "./styles";

let cleanupCSS: (() => void) | null = null;
let cleanupSlot: (() => void) | null = null;

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    // Inject styles
    cleanupCSS = ctx.injectCSS(treeViewCSS);

    // Register the tree view into the main content slot
    cleanupSlot = ctx.registerUISlot(UISlots.MAIN_CONTENT, OutlineTree, {
      order: 0, // Primary content
    });

    // Register commands
    ctx.registerCommand({
      id: "collapse-all",
      name: "Collapse All Nodes",
      shortcut: "Ctrl+Shift+Up",
      execute: () => ctx.emit("tree:collapseAll"),
    });

    ctx.registerCommand({
      id: "expand-all",
      name: "Expand All Nodes",
      shortcut: "Ctrl+Shift+Down",
      execute: () => ctx.emit("tree:expandAll"),
    });
  },

  async onUnload() {
    cleanupCSS?.();
    cleanupSlot?.();
  },
};

export default plugin;
```

### 8.4 `core-keyboard` — Keyboard Shortcuts

```typescript
// src/renderer/plugins/core-keyboard/manifest.ts
import type { PluginManifest } from "../../../main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-keyboard",
  name: "Core: Keyboard Shortcuts",
  version: "1.0.0",
  description: "Provides standard keyboard shortcuts for outliner operations (Enter, Tab, Shift+Tab, arrow keys, etc). Disable to use a custom keybinding plugin instead.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,        // Can be disabled for custom keybinding plugins!
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
```

```typescript
// src/renderer/plugins/core-keyboard/index.ts
import type { RendererPlugin } from "../../../main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { CoreEvents } from "../../../main/plugin-system/EventBus";

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    keydownHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Only handle events from node editors
      if (!target.classList.contains("node-editor")) return;

      const nodeId = target.dataset.nodeId;
      if (!nodeId) return;

      switch (e.key) {
        case "Enter":
          if (!e.shiftKey) {
            e.preventDefault();
            ctx.emit("action:createNodeAfter", nodeId);
          }
          break;

        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            ctx.emit("action:outdentNode", nodeId);
          } else {
            ctx.emit("action:indentNode", nodeId);
          }
          break;

        case "Backspace":
          if (target.textContent === "") {
            e.preventDefault();
            ctx.emit("action:deleteNode", nodeId);
          }
          break;

        case "ArrowUp":
          if (e.altKey && e.shiftKey) {
            e.preventDefault();
            ctx.emit("action:moveNodeUp", nodeId);
          } else if (e.altKey) {
            e.preventDefault();
            ctx.emit("action:focusPrevious", nodeId);
          }
          break;

        case "ArrowDown":
          if (e.altKey && e.shiftKey) {
            e.preventDefault();
            ctx.emit("action:moveNodeDown", nodeId);
          } else if (e.altKey) {
            e.preventDefault();
            ctx.emit("action:focusNext", nodeId);
          }
          break;

        case "Escape":
          e.preventDefault();
          target.blur();
          break;
      }
    };

    document.addEventListener("keydown", keydownHandler, true);

    // Also register global shortcuts
    ctx.registerCommand({
      id: "new-root-node",
      name: "Create New Root Node",
      shortcut: "Ctrl+Enter",
      execute: () => ctx.emit("action:createRootNode"),
    });

    ctx.registerCommand({
      id: "search-focus",
      name: "Search",
      shortcut: "Ctrl+F",
      execute: () => ctx.emit(CoreEvents.SEARCH_OPENED),
    });
  },

  async onUnload() {
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler, true);
      keydownHandler = null;
    }
  },
};

export default plugin;
```

### 8.5 `core-drag-drop` — Drag and Drop Reordering

```typescript
// src/renderer/plugins/core-drag-drop/manifest.ts
import type { PluginManifest } from "../../../main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-drag-drop",
  name: "Core: Drag & Drop",
  version: "1.0.0",
  description: "Enables drag-and-drop reordering and reparenting of nodes. Disable for a lighter, keyboard-only experience.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops", "core-tree-view"],
};
```

```typescript
// src/renderer/plugins/core-drag-drop/index.ts
import type { RendererPlugin } from "../../../main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { CoreHooks } from "../../../main/plugin-system/HookRegistry";

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    // Add CSS classes to make nodes draggable
    ctx.addHook(CoreHooks.NODE_CSS_CLASSES, (classes: string[], nodeId: string) => {
      return [...classes, "draggable-node"];
    }, 100);

    // Inject drag-drop CSS
    ctx.injectCSS(`
      .draggable-node { cursor: grab; }
      .draggable-node:active { cursor: grabbing; opacity: 0.6; }
      .drag-over-top { border-top: 2px solid var(--accent); }
      .drag-over-bottom { border-bottom: 2px solid var(--accent); }
      .drag-over-child { background: var(--focus-bg); }
    `);

    // Delegate drag events on the tree container
    const treeEl = document.querySelector(".outline-tree");
    if (!treeEl) return;

    let draggedNodeId: string | null = null;

    const onDragStart = (e: DragEvent) => {
      const nodeEl = (e.target as HTMLElement).closest("[data-node-id]");
      if (!nodeEl) return;
      draggedNodeId = (nodeEl as HTMLElement).dataset.nodeId!;
      e.dataTransfer!.effectAllowed = "move";
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      // Visual indicator logic...
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const targetEl = (e.target as HTMLElement).closest("[data-node-id]");
      if (!targetEl || !draggedNodeId) return;

      const targetId = (targetEl as HTMLElement).dataset.nodeId!;
      if (draggedNodeId === targetId) return;

      ctx.emit("action:moveNodeTo", draggedNodeId, targetId);
      draggedNodeId = null;
    };

    treeEl.addEventListener("dragstart", onDragStart as EventListener);
    treeEl.addEventListener("dragover", onDragOver as EventListener);
    treeEl.addEventListener("drop", onDrop as EventListener);
  },

  async onUnload() {
    // Event listeners and CSS auto-cleaned
  },
};

export default plugin;
```

### 8.6 `core-undo-redo` — Undo/Redo System

```typescript
// src/main/plugins/core-undo-redo/manifest.ts
import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-undo-redo",
  name: "Core: Undo/Redo",
  version: "1.0.0",
  description: "Provides undo/redo for all node operations. Disable if not needed to reduce memory usage.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
```

```typescript
// src/main/plugins/core-undo-redo/index.ts
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import { CoreEvents } from "../../plugin-system/EventBus";

interface UndoEntry {
  type: string;
  timestamp: number;
  data: any;        // Snapshot before the operation
  reverseData: any; // Data needed to undo
}

const MAX_UNDO_STACK = 100;

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    const db = ctx.getDatabase();
    const undoStack: UndoEntry[] = [];
    const redoStack: UndoEntry[] = [];

    // Listen to all node mutations and record undo entries
    ctx.on(CoreEvents.NODE_CREATED, (node) => {
      undoStack.push({
        type: "create",
        timestamp: Date.now(),
        data: node,
        reverseData: { id: node.id },
      });
      redoStack.length = 0; // Clear redo on new action
      if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    });

    ctx.on(CoreEvents.NODE_UPDATED, (node, changes) => {
      // Snapshot previous values from DB before the change was applied
      undoStack.push({
        type: "update",
        timestamp: Date.now(),
        data: { id: node.id, ...changes },
        reverseData: { id: node.id, previousContent: node.content },
      });
      redoStack.length = 0;
      if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    });

    ctx.on(CoreEvents.NODE_DELETED, (nodeId) => {
      // For undo of delete, we'd need to store the full subtree snapshot
      // Simplified: just store the node ID for soft-delete reversal
      undoStack.push({
        type: "delete",
        timestamp: Date.now(),
        data: { nodeId },
        reverseData: { nodeId },
      });
      redoStack.length = 0;
      if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    });

    // RPC handlers
    ctx.registerRpcHandler("undo", () => {
      if (undoStack.length === 0) return { success: false, error: "Nothing to undo" };

      const entry = undoStack.pop()!;
      redoStack.push(entry);

      // Execute reverse operation based on type
      switch (entry.type) {
        case "create":
          // Undo create = soft delete
          db.run("UPDATE outline_nodes SET is_deleted = 1 WHERE id = ?", [entry.reverseData.id]);
          break;
        case "update":
          // Undo update = restore previous content
          db.run("UPDATE outline_nodes SET content = ?, updated_at = ? WHERE id = ?", [
            entry.reverseData.previousContent,
            Date.now(),
            entry.reverseData.id,
          ]);
          break;
        case "delete":
          // Undo delete = restore (un-soft-delete)
          db.run("UPDATE outline_nodes SET is_deleted = 0 WHERE id = ?", [entry.reverseData.nodeId]);
          break;
      }

      return { success: true, data: { type: entry.type } };
    }, { noPrefix: true });

    ctx.registerRpcHandler("redo", () => {
      if (redoStack.length === 0) return { success: false, error: "Nothing to redo" };

      const entry = redoStack.pop()!;
      undoStack.push(entry);

      // Re-execute the original operation
      switch (entry.type) {
        case "create":
          db.run("UPDATE outline_nodes SET is_deleted = 0 WHERE id = ?", [entry.data.id]);
          break;
        case "update":
          db.run("UPDATE outline_nodes SET content = ?, updated_at = ? WHERE id = ?", [
            entry.data.content ?? entry.data.previousContent,
            Date.now(),
            entry.data.id,
          ]);
          break;
        case "delete":
          db.run("UPDATE outline_nodes SET is_deleted = 1 WHERE id = ?", [entry.data.nodeId]);
          break;
      }

      return { success: true, data: { type: entry.type } };
    }, { noPrefix: true });

    ctx.registerRpcHandler("getUndoRedoState", () => {
      return {
        success: true,
        data: {
          canUndo: undoStack.length > 0,
          canRedo: redoStack.length > 0,
          undoCount: undoStack.length,
          redoCount: redoStack.length,
        },
      };
    }, { noPrefix: true });

    ctx.log(`Undo/Redo ready (max ${MAX_UNDO_STACK} entries)`);
  },

  async onUnload() {
    // Stacks are garbage collected
  },
};

export default plugin;
```

---

## 9. App Shell (Minimal Bootstrap)

### 9.1 Main Process Shell

```typescript
// src/main/index.ts
import { Electrobun, BrowserWindow } from "electrobun/bun";
import { getDatabase, closeDatabase } from "./database/connection";
import { PluginManager } from "./plugin-system/PluginManager";
import path from "path";

// ─── Minimal Database Setup (only plugin system tables) ──
const db = getDatabase();

// ─── Initialize Plugin Manager ──────────────────────────
const appDataDir = process.env.ELECTROBUN_APP_DATA || "./data";
const pluginManager = new PluginManager(db, appDataDir);

// ─── Register Built-in Plugins ──────────────────────────
// These are imported statically — they ship with the app
import coreNodeOps from "./plugins/core-node-ops/index";
import coreFtsSearch from "./plugins/core-fts-search/index";
import coreUndoRedo from "./plugins/core-undo-redo/index";
import coreSettings from "./plugins/core-settings/index";

pluginManager.register(coreNodeOps);
pluginManager.register(coreFtsSearch);
pluginManager.register(coreUndoRedo);
pluginManager.register(coreSettings);

// ─── Discover Community Plugins ─────────────────────────
const communityPluginsDir = path.join(appDataDir, "plugins");
await pluginManager.discoverCommunityPlugins(communityPluginsDir);

// ─── Load All Enabled Plugins ───────────────────────────
await pluginManager.loadAll();

// ─── Create Window ──────────────────────────────────────
const mainWindow = new BrowserWindow({
  title: "Outliner",
  width: 900,
  height: 700,
  url: "electrobun://renderer/index.html",
});

// ─── Bridge RPC: route all renderer calls to plugin handlers ─
const rpc = mainWindow.browserView.rpc;

// Generic RPC router — dispatches to whatever plugin registered the handler
rpc.handle("__rpc__", async (payload: { method: string; params?: any }) => {
  const handler = pluginManager.rpcRegistry.get(payload.method);
  if (!handler) {
    return { success: false, error: `No handler for "${payload.method}"` };
  }
  return handler(payload.params);
});

// Plugin management RPC (always available)
rpc.handle("__plugins__", async (payload: { action: string; pluginId?: string }) => {
  switch (payload.action) {
    case "list":
      return { success: true, data: pluginManager.getPluginList() };
    case "enable":
      return { success: await pluginManager.enablePlugin(payload.pluginId!) };
    case "disable":
      return { success: await pluginManager.disablePlugin(payload.pluginId!) };
    default:
      return { success: false, error: "Unknown plugin action" };
  }
});

// Send enabled plugin list to renderer for its own plugin loading
rpc.handle("__getEnabledRendererPlugins__", async () => {
  const plugins = pluginManager.getPluginList();
  return {
    success: true,
    data: plugins
      .filter((p) => p.enabled && (p.runtime === "renderer" || p.runtime === "both"))
      .map((p) => p.id),
  };
});

// ─── Lifecycle ──────────────────────────────────────────
Electrobun.events.on("will-quit", async () => {
  await pluginManager.shutdown();
  closeDatabase();
});

mainWindow.on("close", () => Electrobun.quit());
```

### 9.2 Renderer Shell

```typescript
// src/renderer/index.ts
import { render } from "preact";
import { html } from "htm/preact";
import { rpc } from "electrobun/browser";
import { RendererPluginManager } from "./plugin-system/RendererPluginManager";
import { AppShell } from "./shell/AppShell";

// ─── Initialize Renderer Plugin Manager ─────────────────
const pluginManager = new RendererPluginManager(rpc);

// ─── Register Built-in Renderer Plugins ─────────────────
import coreTreeView from "./plugins/core-tree-view/index";
import coreEditor from "./plugins/core-editor/index";
import coreKeyboard from "./plugins/core-keyboard/index";
import coreSearch from "./plugins/core-search/index";
import coreBreadcrumb from "./plugins/core-breadcrumb/index";
import coreZoom from "./plugins/core-zoom/index";
import coreDragDrop from "./plugins/core-drag-drop/index";
import coreToolbar from "./plugins/core-toolbar/index";
import coreTheme from "./plugins/core-theme/index";
import coreContextMenu from "./plugins/core-context-menu/index";

pluginManager.register(coreTreeView);
pluginManager.register(coreEditor);
pluginManager.register(coreKeyboard);
pluginManager.register(coreSearch);
pluginManager.register(coreBreadcrumb);
pluginManager.register(coreZoom);
pluginManager.register(coreDragDrop);
pluginManager.register(coreToolbar);
pluginManager.register(coreTheme);
pluginManager.register(coreContextMenu);

// ─── Load Enabled Plugins ───────────────────────────────
await pluginManager.loadFromMainProcess();

// ─── Render App Shell ───────────────────────────────────
render(
  html`<${AppShell} pluginManager=${pluginManager} />`,
  document.getElementById("app")!
);
```

### 9.3 App Shell Component (Slot-Based)

```typescript
// src/renderer/shell/AppShell.ts
import { useState, useEffect, useCallback } from "preact/hooks";
import { html } from "htm/preact";
import type { RendererPluginManager } from "../plugin-system/RendererPluginManager";
import { UISlots, type SlotEntry } from "../plugin-system/UISlotRegistry";

interface Props {
  pluginManager: RendererPluginManager;
}

/**
 * The App Shell renders named UI slots.
 * All actual UI content is injected by plugins.
 * The shell itself is just a layout frame.
 */
export function AppShell({ pluginManager }: Props) {
  const [, forceUpdate] = useState(0);
  const slots = pluginManager.uiSlots;

  // Re-render when any slot changes
  useEffect(() => {
    return slots.onChange(() => forceUpdate((n) => n + 1));
  }, [slots]);

  const renderSlot = useCallback(
    (slotName: string) => {
      const entries = slots.getSlot(slotName);
      return entries.map(
        (entry: SlotEntry) =>
          html`<${entry.component}
            key=${entry.pluginId}
            pluginManager=${pluginManager}
            ...${entry.props || {}}
          />`
      );
    },
    [slots, pluginManager]
  );

  return html`
    <div class="app-shell">
      <!-- Toolbar area -->
      <header class="shell-toolbar">
        <div class="slot-toolbar-left">${renderSlot(UISlots.TOOLBAR_LEFT)}</div>
        <div class="slot-toolbar-center">${renderSlot(UISlots.TOOLBAR_CENTER)}</div>
        <div class="slot-toolbar-right">${renderSlot(UISlots.TOOLBAR_RIGHT)}</div>
      </header>

      <!-- Main area -->
      <div class="shell-body">
        <aside class="slot-sidebar-left">${renderSlot(UISlots.SIDEBAR_LEFT)}</aside>
        <main class="slot-main-content">${renderSlot(UISlots.MAIN_CONTENT)}</main>
        <aside class="slot-sidebar-right">${renderSlot(UISlots.SIDEBAR_RIGHT)}</aside>
      </div>

      <!-- Status bar -->
      <footer class="shell-statusbar">
        <div class="slot-statusbar-left">${renderSlot(UISlots.STATUSBAR_LEFT)}</div>
        <div class="slot-statusbar-center">${renderSlot(UISlots.STATUSBAR_CENTER)}</div>
        <div class="slot-statusbar-right">${renderSlot(UISlots.STATUSBAR_RIGHT)}</div>
      </footer>

      <!-- Overlays -->
      <div class="slot-modals">${renderSlot(UISlots.MODAL)}</div>
      <div class="slot-command-palette">${renderSlot(UISlots.COMMAND_PALETTE)}</div>
    </div>
  `;
}
```

---

## 10. Plugin Settings UI

```typescript
// src/renderer/shell/PluginSettingsView.ts
import { useState, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { rpc } from "electrobun/browser";
import type { PluginManifest } from "../../main/plugin-system/PluginManifest";

interface PluginInfo extends PluginManifest {
  enabled: boolean;
  loaded: boolean;
}

export function PluginSettingsView() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [filter, setFilter] = useState<"all" | "core" | "community">("all");

  const loadPlugins = async () => {
    const result = await rpc.invoke("__plugins__", { action: "list" });
    if (result.success) setPlugins(result.data);
  };

  useEffect(() => { loadPlugins(); }, []);

  const togglePlugin = async (pluginId: string, currentlyEnabled: boolean) => {
    const action = currentlyEnabled ? "disable" : "enable";
    const result = await rpc.invoke("__plugins__", { action, pluginId });

    if (result.success) {
      loadPlugins(); // Refresh
    } else {
      alert(`Failed to ${action} plugin. It may have dependents.`);
    }
  };

  const filtered = plugins.filter((p) => filter === "all" || p.type === filter);

  const corePlugins = filtered.filter((p) => p.type === "core");
  const communityPlugins = filtered.filter((p) => p.type === "community");

  const renderPlugin = (plugin: PluginInfo) => html`
    <div class="plugin-card ${plugin.enabled ? "enabled" : "disabled"}">
      <div class="plugin-header">
        <div class="plugin-info">
          <span class="plugin-name">${plugin.name}</span>
          <span class="plugin-version">v${plugin.version}</span>
          ${plugin.essential && html`<span class="plugin-badge essential">Essential</span>`}
          <span class="plugin-badge ${plugin.type}">${plugin.type}</span>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked=${plugin.enabled}
            disabled=${plugin.essential}
            onChange=${() => togglePlugin(plugin.id, plugin.enabled)}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="plugin-description">${plugin.description}</p>
      <div class="plugin-meta">
        <span>by ${plugin.author}</span>
        ${plugin.dependencies?.length > 0 && html`
          <span>Requires: ${plugin.dependencies.join(", ")}</span>
        `}
      </div>
    </div>
  `;

  return html`
    <div class="plugin-settings">
      <h2>Plugins</h2>
      <p class="subtitle">Enable or disable features. Core plugins ship with the app. Community plugins are installed separately.</p>

      <div class="filter-tabs">
        <button class=${filter === "all" ? "active" : ""} onClick=${() => setFilter("all")}>
          All (${plugins.length})
        </button>
        <button class=${filter === "core" ? "active" : ""} onClick=${() => setFilter("core")}>
          Core (${plugins.filter((p) => p.type === "core").length})
        </button>
        <button class=${filter === "community" ? "active" : ""} onClick=${() => setFilter("community")}>
          Community (${plugins.filter((p) => p.type === "community").length})
        </button>
      </div>

      ${corePlugins.length > 0 && html`
        <h3>Core Plugins</h3>
        <div class="plugin-list">
          ${corePlugins.map(renderPlugin)}
        </div>
      `}

      ${communityPlugins.length > 0 && html`
        <h3>Community Plugins</h3>
        <div class="plugin-list">
          ${communityPlugins.map(renderPlugin)}
        </div>
      `}
    </div>
  `;
}
```

---

## 11. Complete Built-In Plugin Registry

| Plugin ID | Name | Runtime | Essential | Default | Dependencies | What It Does |
|---|---|---|---|---|---|---|
| `core-node-ops` | Node Operations | main | ✅ | ✅ | — | SQLite schema, CRUD, tree queries |
| `core-fts-search` | Full-Text Search | both | ❌ | ✅ | `core-node-ops` | FTS5 search index + search UI |
| `core-undo-redo` | Undo/Redo | both | ❌ | ✅ | `core-node-ops` | Operation history stack |
| `core-settings` | Settings | both | ✅ | ✅ | — | Plugin enable/disable UI, app prefs |
| `core-tree-view` | Tree View | renderer | ✅ | ✅ | `core-node-ops`, `core-editor` | Main outline tree renderer |
| `core-editor` | Node Editor | renderer | ✅ | ✅ | `core-node-ops` | Inline contenteditable editor |
| `core-keyboard` | Keyboard Shortcuts | renderer | ❌ | ✅ | `core-node-ops` | Enter, Tab, arrow key bindings |
| `core-search` | Search UI | renderer | ❌ | ✅ | `core-fts-search` | Search bar + results panel |
| `core-breadcrumb` | Breadcrumb | renderer | ❌ | ✅ | `core-zoom` | Navigation breadcrumb trail |
| `core-zoom` | Zoom | renderer | ❌ | ✅ | `core-node-ops` | Zoom into/out of nodes |
| `core-drag-drop` | Drag & Drop | renderer | ❌ | ✅ | `core-node-ops`, `core-tree-view` | Drag reordering of nodes |
| `core-toolbar` | Toolbar | renderer | ❌ | ✅ | — | Top toolbar UI frame |
| `core-theme` | Default Theme | renderer | ❌ | ✅ | — | Base CSS styles and dark mode |
| `core-context-menu` | Context Menu | renderer | ❌ | ✅ | `core-node-ops` | Right-click node menu |

---

## 12. Example Third-Party Plugin

```typescript
// plugins/plugin-word-count/manifest.ts
import type { PluginManifest } from "../../src/main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "community-word-count",
  name: "Word Count",
  version: "1.0.0",
  description: "Shows a live word count in the status bar.",
  author: "Community Author",
  type: "community",
  runtime: "renderer",
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
```

```typescript
// plugins/plugin-word-count/index.ts
import type { RendererPlugin } from "../../src/main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../src/renderer/plugin-system/RendererPluginContext";
import { UISlots } from "../../src/renderer/plugin-system/UISlotRegistry";
import { CoreEvents } from "../../src/main/plugin-system/EventBus";
import { manifest } from "./manifest";
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";

function WordCountWidget({ pluginManager }: any) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = async () => {
      const result = await pluginManager.rpc("getStats");
      if (result.success) setCount(result.data.nodeCount);
    };

    update();

    const unsub = pluginManager.eventBus.on(CoreEvents.NODE_CREATED, update);
    const unsub2 = pluginManager.eventBus.on(CoreEvents.NODE_DELETED, update);
    return () => { unsub(); unsub2(); };
  }, []);

  return html`<span class="word-count">${count} nodes</span>`;
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctx.registerUISlot(UISlots.STATUSBAR_RIGHT, WordCountWidget, { order: 200 });

    ctx.injectCSS(`
      .word-count {
        font-size: 12px;
        color: var(--text-muted);
        padding: 0 8px;
      }
    `);
  },

  async onUnload() {
    // Slot and CSS auto-cleaned
  },
};

export default plugin;
```

---

## 13. Plugin Interaction Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                    Plugin Communication Flow                       │
│                                                                    │
│  core-keyboard ──(event: action:indentNode)──► core-tree-view     │
│       │                                              │             │
│       │                                              ▼             │
│       │                                        store.indentNode()  │
│       │                                              │             │
│       │                                              ▼             │
│       │                                     rpc("indentNode")      │
│       │                                              │             │
│  ═════╪══════════════════════════════════════════════╪═════════    │
│  MAIN │                                              ▼             │
│       │                                   core-node-ops handler    │
│       │                                              │             │
│       │                                      ┌───────┴────────┐   │
│       │                                      ▼                ▼   │
│       │                              SQLite update    emit event   │
│       │                                               NODE_INDENTED│
│       │                                                    │       │
│       │              ┌─────────────────────────────────────┤       │
│       │              ▼                                     ▼       │
│       │      core-undo-redo                        (any listener)  │
│       │      (records undo entry)                                  │
│       │                                                            │
│  ═════╪════════════════════════════════════════════════════════    │
│  RENDERER                                                          │
│       │                                                            │
│       │         tree reloaded via getFullTree RPC                  │
│       │              │                                             │
│       │              ▼                                             │
│       │   ┌──── hook: TREE_BEFORE_RENDER ────┐                    │
│       │   │                                  │                    │
│       │   │  community-tag-colors plugin     │                    │
│       │   │  (adds color CSS classes)        │                    │
│       │   │                                  │                    │
│       │   └──────────────────────────────────┘                    │
│       │              │                                             │
│       │              ▼                                             │
│       │       core-tree-view re-renders                            │
│       │              │                                             │
│       │         ┌────┴─────────────────┐                           │
│       │         ▼                      ▼                           │
│       │   UISlot: node:badge     UISlot: node:actions              │
│       │   (word-count badge)     (custom action buttons)           │
│       │                                                            │
└────────────────────────────────────────────────────────────────────┘
```

---

## Summary of Extension Mechanisms

| Mechanism | Purpose | Example |
|---|---|---|
| **Events** | Fire-and-forget notifications | `NODE_CREATED` → undo plugin records it |
| **Hooks** | Pipeline data transformation | `NODE_CONTENT_RENDER` → markdown plugin converts `**bold**` to `<strong>` |
| **UI Slots** | Inject components into layout | Status bar widget, sidebar panel, node badges |
| **RPC Handlers** | Add new backend capabilities | Custom export format, AI completion endpoint |
| **Commands** | User-triggerable actions | "Export to Markdown", "Toggle Dark Mode" |
| **Settings** | Per-plugin configuration | Theme color, keyboard shortcut remapping |
| **Migrations** | Plugin-specific DB tables | Tags table, bookmarks table |
| **CSS Injection** | Visual customization | Custom theme, node decorations |

This design gives the outliner app Obsidian-level extensibility while keeping the core shell under **200 lines of code**. Users can disable `core-drag-drop`, `core-search`, `core-undo-redo`, or `core-breadcrumb` if they want a minimal, fast-loading outliner — just like toggling core plugins in Obsidian.
