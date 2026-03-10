import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import { OutlineService } from "./service";
import { randomUUID } from "crypto";

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    ctx.runMigration(1, "create_outline_nodes", `
      CREATE TABLE IF NOT EXISTS outline_nodes (
        id          TEXT PRIMARY KEY,
        content     TEXT NOT NULL DEFAULT '',
        parent_id   TEXT,
        position    INTEGER NOT NULL DEFAULT 0,
        is_expanded INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (parent_id) REFERENCES outline_nodes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON outline_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_position ON outline_nodes(parent_id, position);
      CREATE INDEX IF NOT EXISTS idx_nodes_content ON outline_nodes(content);
      CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON outline_nodes(is_deleted)
    `);

    const db = ctx.getDatabase();

    // Migrate from outliner_nodes if it exists (legacy/typo table name)
    try {
      const hasOutliner = db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='outliner_nodes'").get();
      const outlineCount = (db.query("SELECT COUNT(*) as c FROM outline_nodes").get() as { c: number }).c;
      if (hasOutliner && outlineCount === 0) {
        db.run(`
          INSERT INTO outline_nodes (id, content, parent_id, position, is_expanded, created_at, updated_at, is_deleted)
          SELECT id, COALESCE(content,''), parent_id, COALESCE(position,0), COALESCE(is_expanded,1), COALESCE(created_at,0), COALESCE(updated_at,0), COALESCE(is_deleted,0)
          FROM outliner_nodes
        `);
        ctx.log("Migrated data from outliner_nodes to outline_nodes");
      }
    } catch (_) {}

    const service = new OutlineService(db);

    ctx.registerRpcHandler("getFullTree", () => service.getFullTree(), { noPrefix: true });
    ctx.registerRpcHandler("getSubtree", (p) => service.getSubtree(p), { noPrefix: true });
    ctx.registerRpcHandler("getNode", (p) => service.getNode(p.id), { noPrefix: true });
    ctx.registerRpcHandler("getAncestors", (p) => service.getAncestors(p.nodeId), { noPrefix: true });
    ctx.registerRpcHandler("getStats", () => service.getStats(), { noPrefix: true });
    ctx.registerRpcHandler("createNode", (p) => service.createNode(p), { noPrefix: true });
    ctx.registerRpcHandler("updateNode", (p) => service.updateNode(p), { noPrefix: true });
    ctx.registerRpcHandler("moveNode", (p) => service.moveNode(p), { noPrefix: true });
    ctx.registerRpcHandler("indentNode", (p) => service.indentNode(p), { noPrefix: true });
    ctx.registerRpcHandler("outdentNode", (p) => service.outdentNode(p), { noPrefix: true });
    ctx.registerRpcHandler("deleteNode", (p) => service.deleteNode(p), { noPrefix: true });

    // Seed if empty
    const count = db.query("SELECT COUNT(*) as c FROM outline_nodes WHERE is_deleted = 0").get() as { c: number };
    if (count.c === 0) {
      const now = Date.now();
      const ins = db.prepare(`
        INSERT INTO outline_nodes (id, content, parent_id, position, is_expanded, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, 1, ?, ?, 0)
      `);
      const rootId = randomUUID();
      const c1 = randomUUID();
      const c2 = randomUUID();
      const gc = randomUUID();
      db.transaction(() => {
        ins.run(rootId, "Welcome to Outliner", null, 0, now, now);
        ins.run(c1, "Click on any bullet to zoom in", rootId, 0, now, now);
        ins.run(c2, "Use Tab/Shift+Tab to indent/outdent", rootId, 1, now, now);
        ins.run(gc, "Press Enter to create a new sibling", c1, 0, now, now);
      })();
    }

    ctx.log("Node operations ready");
  },
};

export default plugin;
