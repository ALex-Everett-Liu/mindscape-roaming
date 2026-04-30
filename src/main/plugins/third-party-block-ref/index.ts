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

    ctx.log("Block reference plugin ready");
  },
};

export default plugin;
