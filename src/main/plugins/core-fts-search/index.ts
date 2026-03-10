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

    // Rebuild FTS if we have nodes but the token index is empty.
    // For external content tables, COUNT(outline_nodes_fts) reflects the content table,
    // so we must check outline_nodes_fts_docsize (0 rows = index empty, MATCH fails).
    const nodeCount = (db.query("SELECT COUNT(*) as c FROM outline_nodes").get() as { c: number }).c;
    const docsizeCount = (db.query("SELECT COUNT(*) as c FROM outline_nodes_fts_docsize").get() as { c: number }).c;
    ctx.log("FTS init: outline_nodes=", nodeCount, "outline_nodes_fts_docsize=", docsizeCount);
    if (nodeCount > 0 && docsizeCount === 0) {
      ctx.log("Rebuilding FTS index for existing nodes");
      db.run("INSERT INTO outline_nodes_fts(outline_nodes_fts) VALUES('rebuild')");
      const docsizeAfter = (db.query("SELECT COUNT(*) as c FROM outline_nodes_fts_docsize").get() as { c: number }).c;
      ctx.log("FTS after rebuild:", docsizeAfter);
    }

    ctx.registerRpcHandler("search", (params: SearchParams) => {
      ctx.log("search called, query:", params.query, "limit:", params.limit ?? 50);
      try {
        // FTS5 prefix: bareword "term*" per sqlite.org/fts5.html
        const tokens = params.query.split(/\s+/).filter((t) => t.length > 0);
        const ftsQuery = tokens.map((t) => `${t}*`).join(" AND ");
        ctx.log("FTS query:", ftsQuery);

        let rows = db
          .query(
            `SELECT n.* FROM outline_nodes n
             JOIN outline_nodes_fts fts ON n.rowid = fts.rowid
             WHERE outline_nodes_fts MATCH ? AND n.is_deleted = 0
             ORDER BY rank LIMIT ?`
          )
          .all(ftsQuery, params.limit ?? 50) as Record<string, unknown>[];

        if (rows.length === 0 && tokens.length > 0) {
          ctx.log("prefix query returned 0, trying exact token match for:", params.query);
          rows = db
            .query(
              `SELECT n.* FROM outline_nodes n
               JOIN outline_nodes_fts fts ON n.rowid = fts.rowid
               WHERE outline_nodes_fts MATCH ? AND n.is_deleted = 0
               ORDER BY rank LIMIT ?`
            )
            .all(params.query, params.limit ?? 50) as Record<string, unknown>[];
          ctx.log("exact match returned", rows.length, "rows");
        }

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
        ctx.log("search error:", e);
        return { success: false, error: String(e) };
      }
    }, { noPrefix: true });

    ctx.log("FTS search ready");
  },
};

export default plugin;
