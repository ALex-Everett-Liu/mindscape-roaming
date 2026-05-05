import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import path from "path";
import { getDataDir } from "../../database/connection";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    const dataDir = getDataDir();
    const normalizedDataDir = path.resolve(dataDir);

    ctx.registerRpcHandler(
      "readImageFile",
      async (params: { path: string }) => {
        const resolved = path.resolve(dataDir, params.path);

        if (!resolved.startsWith(normalizedDataDir + path.sep) && resolved !== normalizedDataDir) {
          return { success: false, error: "Access denied: path must be within the vault" };
        }

        const ext = path.extname(resolved).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          return { success: false, error: `Unsupported image type: ${ext}` };
        }

        try {
          const file = Bun.file(resolved);
          const exists = await file.exists();
          if (!exists) {
            return { success: false, error: `File not found: ${params.path}` };
          }

          const buffer = await file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          const mime = MIME_MAP[ext] || "application/octet-stream";
          const dataUrl = `data:${mime};base64,${base64}`;

          return { success: true, data: dataUrl };
        } catch (err: any) {
          return { success: false, error: `Failed to read image: ${err.message}` };
        }
      },
      { noPrefix: true }
    );

    ctx.log("Image Viewer ready");
  },
};

export default plugin;
