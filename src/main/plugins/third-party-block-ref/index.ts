import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import type { OutlineNode } from "../../../shared/types";

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    const db = ctx.getDatabase();

    ctx.registerRpcHandler(
      "resolveBlockRef",
      (params: { id: string }): { success: boolean; data?: OutlineNode; error?: string } => {
        try {
          const row = db
            .query("SELECT * FROM outline_nodes WHERE id = ? AND is_deleted = 0")
            .get(params.id) as Record<string, unknown> | null;

          if (!row) {
            return { success: false, error: "Block not found" };
          }

          return {
            success: true,
            data: {
              id: row.id as string,
              content: row.content as string,
              parent_id: (row.parent_id as string | null) ?? null,
              position: row.position as number,
              is_expanded: Boolean(row.is_expanded),
              created_at: row.created_at as number,
              updated_at: row.updated_at as number,
            },
          };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    ctx.registerRpcHandler(
      "getBlockBacklinks",
      (params: { id: string }): { success: boolean; data?: OutlineNode[]; error?: string } => {
        try {
          const pattern = `%((${params.id}))%`;
          const rows = db
            .query("SELECT * FROM outline_nodes WHERE content LIKE ? AND is_deleted = 0")
            .all(pattern) as Record<string, unknown>[];

          const data = rows.map((r) => ({
            id: r.id as string,
            content: r.content as string,
            parent_id: (r.parent_id as string | null) ?? null,
            position: r.position as number,
            is_expanded: Boolean(r.is_expanded),
            created_at: r.created_at as number,
            updated_at: r.updated_at as number,
          }));

          return { success: true, data };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    ctx.registerRpcHandler(
      "getBacklinkCounts",
      (): { success: boolean; data?: Record<string, number>; error?: string } => {
        try {
          const rows = db
            .query("SELECT content FROM outline_nodes WHERE content LIKE '%((%))%' AND is_deleted = 0")
            .all() as { content: string }[];

          const counts: Record<string, number> = {};
          const regex = /\(\(([^\s)]+)\)\)/g;
          for (const row of rows) {
            let m: RegExpExecArray | null;
            regex.lastIndex = 0;
            while ((m = regex.exec(row.content)) !== null) {
              counts[m[1]] = (counts[m[1]] || 0) + 1;
            }
          }

          return { success: true, data: counts };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      },
      { noPrefix: true }
    );

    ctx.log("Block reference plugin ready");
  },
};

export default plugin;
