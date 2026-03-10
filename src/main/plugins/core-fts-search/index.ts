import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import type { OutlineNode } from "../../../shared/types";
import type { SearchParams } from "../../../shared/types";

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

    ctx.registerRpcHandler("search", (params: SearchParams) => {
      try {
        const ftsQuery = params.query
          .split(/\s+/)
          .map((t) => `"${t}"*`)
          .join(" AND ");
        const rows = db
          .query(
            `SELECT n.* FROM outline_nodes n
             JOIN outline_nodes_fts fts ON n.rowid = fts.rowid
             WHERE outline_nodes_fts MATCH ? AND n.is_deleted = 0
             ORDER BY rank LIMIT ?`
          )
          .all(ftsQuery, params.limit ?? 50) as Record<string, unknown>[];

        const data = rows.map((r) => ({
          id: r.id,
          content: r.content,
          parent_id: r.parent_id,
          position: r.position,
          is_expanded: Boolean(r.is_expanded),
          created_at: r.created_at,
          updated_at: r.updated_at,
        })) as OutlineNode[];

        return { success: true, data };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }, { noPrefix: true });

    ctx.log("FTS search ready");
  },
};

export default plugin;
