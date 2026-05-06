import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import type { QueryNodesBySizeParams, OutlineNode, RpcResult } from "../../rpc/types";

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    const db = ctx.getDatabase();

    ctx.registerRpcHandler("queryNodesBySize", (params: QueryNodesBySizeParams): RpcResult<OutlineNode[]> => {
      try {
        const minSize = params.min_size ?? 0;
        const maxSize = params.max_size ?? Number.MAX_SAFE_INTEGER;
        const limit = params.limit ?? 50;

        const rows = db.query(
          `SELECT * FROM outline_nodes
           WHERE is_deleted = 0
           AND node_size >= ? AND node_size <= ?
           ORDER BY node_size DESC
           LIMIT ?`
        ).all(minSize, maxSize, limit) as Record<string, unknown>[];

        const nodes: OutlineNode[] = rows.map((row) => ({
          id: row.id as string,
          content: row.content as string,
          parent_id: row.parent_id as string | null,
          position: row.position as number,
          is_expanded: Boolean(row.is_expanded),
          is_page: Boolean(row.is_page),
          node_size: (row.node_size as number) ?? 20.0,
          category: (row.category as string) ?? "",
          created_at: row.created_at as number,
          updated_at: row.updated_at as number,
        }));

        return { success: true, data: nodes };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }, { noPrefix: true });

    ctx.log("Node Size plugin ready");
  },
};

export default plugin;
