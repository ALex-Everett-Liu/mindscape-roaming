import { randomUUID } from "crypto";
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";

interface BookmarkRow {
  id: string;
  node_id: string;
  pinned_at: number;
  click_count: number;
}

interface BookmarkWithNode extends BookmarkRow {
  node_content: string;
}

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    ctx.runMigration(1, "create_bookmarks", `
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL UNIQUE,
        pinned_at INTEGER NOT NULL,
        click_count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (node_id) REFERENCES outline_nodes(id) ON DELETE CASCADE
      );
    `);

    const db = ctx.getDatabase();

    ctx.registerRpcHandler(
      "pinBookmark",
      (params: { nodeId: string }) => {
        const id = randomUUID();
        const now = Date.now();
        db.run(
          "INSERT OR IGNORE INTO bookmarks (id, node_id, pinned_at, click_count) VALUES (?, ?, ?, 0)",
          [id, params.nodeId, now]
        );
        const row = db
          .query("SELECT * FROM bookmarks WHERE node_id = ?")
          .get(params.nodeId) as BookmarkRow | null;
        return { success: true, data: row };
      },
      { noPrefix: true }
    );

    ctx.registerRpcHandler(
      "unpinBookmark",
      (params: { nodeId: string }) => {
        const result = db.run(
          "DELETE FROM bookmarks WHERE node_id = ?",
          [params.nodeId]
        );
        return { success: result.changes > 0 };
      },
      { noPrefix: true }
    );

    ctx.registerRpcHandler(
      "getBookmarks",
      (params?: { sortBy?: "pinned_at" | "click_count" }) => {
        const sortColumn = params?.sortBy === "click_count" ? "b.click_count DESC, b.pinned_at DESC" : "b.pinned_at DESC";
        const rows = db
          .query(`
            SELECT b.id, b.node_id, b.pinned_at, b.click_count, 
                   COALESCE(n.content, '(deleted)') as node_content
            FROM bookmarks b
            LEFT JOIN outline_nodes n ON b.node_id = n.id AND n.is_deleted = 0
            ORDER BY ${sortColumn}
          `)
          .all() as BookmarkWithNode[];
        return { success: true, data: rows };
      },
      { noPrefix: true }
    );

    ctx.registerRpcHandler(
      "isBookmarked",
      (params: { nodeId: string }) => {
        const row = db
          .query("SELECT 1 FROM bookmarks WHERE node_id = ?")
          .get(params.nodeId);
        return { success: true, data: !!row };
      },
      { noPrefix: true }
    );

    ctx.registerRpcHandler(
      "incrementBookmarkClick",
      (params: { nodeId: string }) => {
        db.run(
          "UPDATE bookmarks SET click_count = click_count + 1 WHERE node_id = ?",
          [params.nodeId]
        );
        return { success: true };
      },
      { noPrefix: true }
    );

    ctx.log("Bookmarks ready");
  },
};

export default plugin;
