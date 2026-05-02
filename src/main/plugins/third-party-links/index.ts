import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import type {
  OutlineNode,
  LinkRecord,
  LinkWithNode,
} from "../../../shared/types";

function clampWeight(w: number | undefined | null): number {
  if (w == null) return 1.0;
  return Math.min(10, Math.max(0, w));
}

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    const db = ctx.getDatabase();

    // Create node_links table
    ctx.runMigration(1, "create_node_links", `
      CREATE TABLE IF NOT EXISTS node_links (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        weight REAL NOT NULL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (source_id) REFERENCES outline_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES outline_nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_node_links_source ON node_links(source_id);
      CREATE INDEX IF NOT EXISTS idx_node_links_target ON node_links(target_id);
    `);

    // createLink
    ctx.registerRpcHandler(
      "createLink",
      (params: {
        source_id: string;
        target_id: string;
        category?: string;
        weight?: number;
      }): { success: boolean; data?: LinkRecord; error?: string } => {
        try {
          if (params.source_id === params.target_id) {
            return { success: false, error: "Cannot link a node to itself" };
          }

          // Verify both nodes exist
          const source = db
            .query("SELECT id FROM outline_nodes WHERE id = ? AND is_deleted = 0")
            .get(params.source_id) as { id: string } | null;
          if (!source) {
            return { success: false, error: "Source node not found" };
          }
          const target = db
            .query("SELECT id FROM outline_nodes WHERE id = ? AND is_deleted = 0")
            .get(params.target_id) as { id: string } | null;
          if (!target) {
            return { success: false, error: "Target node not found" };
          }

          // Check for duplicate link
          const existing = db
            .query(
              "SELECT id FROM node_links WHERE source_id = ? AND target_id = ?"
            )
            .get(params.source_id, params.target_id) as { id: string } | null;
          if (existing) {
            return {
              success: false,
              error: "A link between these nodes already exists",
            };
          }

          const id = crypto.randomUUID();
          const category = params.category ?? "";
          const weight = clampWeight(params.weight);
          const created_at = Date.now();

          db.run(
            "INSERT INTO node_links (id, source_id, target_id, category, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [id, params.source_id, params.target_id, category, weight, created_at]
          );

          return {
            success: true,
            data: {
              id,
              source_id: params.source_id,
              target_id: params.target_id,
              category,
              weight,
              created_at,
            },
          };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    // getNodeLinks
    ctx.registerRpcHandler(
      "getNodeLinks",
      (params: {
        node_id: string;
      }): { success: boolean; data?: LinkWithNode[]; error?: string } => {
        try {
          const rows = db
            .query(
              `SELECT nl.*,
                 CASE WHEN nl.source_id = ?
                   THEN target.content
                   ELSE source.content
                 END AS other_content,
                 CASE WHEN nl.source_id = ?
                   THEN target.id
                   ELSE source.id
                 END AS other_id,
                 CASE WHEN nl.source_id = ?
                   THEN 'outgoing'
                   ELSE 'incoming'
                 END AS direction
               FROM node_links nl
               LEFT JOIN outline_nodes source ON nl.source_id = source.id AND source.is_deleted = 0
               LEFT JOIN outline_nodes target ON nl.target_id = target.id AND target.is_deleted = 0
               WHERE (nl.source_id = ? OR nl.target_id = ?)
                 AND source.id IS NOT NULL
                 AND target.id IS NOT NULL
               ORDER BY nl.created_at DESC`
            )
            .all(
              params.node_id,
              params.node_id,
              params.node_id,
              params.node_id,
              params.node_id
            ) as Array<
            Record<string, unknown> & {
              other_content: string | null;
              other_id: string | null;
              direction: string;
            }
          >;

          const data: LinkWithNode[] = rows.map((r) => ({
            id: r.id as string,
            source_id: r.source_id as string,
            target_id: r.target_id as string,
            category: r.category as string,
            weight: r.weight as number,
            created_at: r.created_at as number,
            direction: r.direction as "outgoing" | "incoming",
            other_node: r.other_id
              ? {
                  id: r.other_id as string,
                  content: (r.other_content as string) ?? "",
                  parent_id: null,
                  position: 0,
                  is_expanded: false,
                  is_page: false,
                  created_at: 0,
                  updated_at: 0,
                }
              : null,
          }));

          return { success: true, data };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    // getLinkCounts
    ctx.registerRpcHandler(
      "getLinkCounts",
      (): {
        success: boolean;
        data?: Record<string, { total: number; outgoing: number; incoming: number }>;
        error?: string;
      } => {
        try {
          const counts: Record<
            string,
            { total: number; outgoing: number; incoming: number }
          > = {};

          const rows = db
            .query(
              `SELECT nl.source_id, nl.target_id,
                 s.is_deleted AS s_del, t.is_deleted AS t_del
               FROM node_links nl
               LEFT JOIN outline_nodes s ON nl.source_id = s.id
               LEFT JOIN outline_nodes t ON nl.target_id = t.id`
            )
            .all() as Array<{
            source_id: string;
            target_id: string;
            s_del: number | null;
            t_del: number | null;
          }>;

          for (const row of rows) {
            if (row.s_del == null || row.s_del !== 0) continue;
            if (row.t_del == null || row.t_del !== 0) continue;

            const src = row.source_id;
            const tgt = row.target_id;

            if (!counts[src]) counts[src] = { total: 0, outgoing: 0, incoming: 0 };
            if (!counts[tgt]) counts[tgt] = { total: 0, outgoing: 0, incoming: 0 };

            counts[src].total++;
            counts[src].outgoing++;
            counts[tgt].total++;
            counts[tgt].incoming++;
          }

          return { success: true, data: counts };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    // deleteLink
    ctx.registerRpcHandler(
      "deleteLink",
      (params: { id: string }): { success: boolean; error?: string } => {
        try {
          const result = db.run("DELETE FROM node_links WHERE id = ?", [
            params.id,
          ]);
          if (result.changes === 0) {
            return { success: false, error: "Link not found" };
          }
          return { success: true };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    // updateLink
    ctx.registerRpcHandler(
      "updateLink",
      (params: {
        id: string;
        category?: string;
        weight?: number;
      }): { success: boolean; data?: LinkRecord; error?: string } => {
        try {
          // Check link exists
          const row = db
            .query("SELECT * FROM node_links WHERE id = ?")
            .get(params.id) as Record<string, unknown> | null;

          if (!row) {
            return { success: false, error: "Link not found" };
          }

          const category =
            params.category !== undefined ? params.category : (row.category as string);
          const weight =
            params.weight !== undefined
              ? clampWeight(params.weight)
              : (row.weight as number);

          db.run(
            "UPDATE node_links SET category = ?, weight = ? WHERE id = ?",
            [category, weight, params.id]
          );

          return {
            success: true,
            data: {
              id: row.id as string,
              source_id: row.source_id as string,
              target_id: row.target_id as string,
              category,
              weight,
              created_at: row.created_at as number,
            },
          };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    ctx.log("Node Links plugin ready");
  },
};

export default plugin;
