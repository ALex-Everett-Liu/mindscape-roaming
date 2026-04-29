import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { api } from "../../rpc/api";
import {
  exportToJson,
  exportToMarkdown,
  exportToPlainText,
  exportToOpml,
  triggerDownload,
} from "./exportFormats";

let ctxRef: RendererPluginContext | null = null;

async function doExport(
  format: "json" | "markdown" | "txt" | "opml"
): Promise<void> {
  const res = await api.getFullTree();
  if (!res.success || !res.data || res.data.length === 0) {
    // Silently skip if tree is empty
    return;
  }

  const tree = res.data;
  let result: { content: string; filename: string; mimeType: string };

  switch (format) {
    case "json":
      result = exportToJson(tree);
      break;
    case "markdown":
      result = exportToMarkdown(tree);
      break;
    case "txt":
      result = exportToPlainText(tree);
      break;
    case "opml":
      result = exportToOpml(tree);
      break;
  }

  triggerDownload(result.content, result.filename, result.mimeType);
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;

    ctx.registerCommand({
      id: "export-outline-json",
      name: "Export outline as JSON",
      category: "Data",
      keywords: ["export", "json", "save", "download"],
      execute: () => doExport("json"),
    });

    ctx.registerCommand({
      id: "export-outline-markdown",
      name: "Export outline as Markdown",
      category: "Data",
      keywords: ["export", "markdown", "md", "save", "download"],
      execute: () => doExport("markdown"),
    });

    ctx.registerCommand({
      id: "export-outline-opml",
      name: "Export outline as OPML",
      category: "Data",
      keywords: ["export", "opml", "xml", "save", "download"],
      execute: () => doExport("opml"),
    });

    ctx.registerCommand({
      id: "export-outline-txt",
      name: "Export outline as plain text",
      category: "Data",
      keywords: ["export", "text", "txt", "plain", "save", "download"],
      execute: () => doExport("txt"),
    });
  },

  async onUnload() {
    ctxRef?.unregisterAllCommands();
    ctxRef = null;
  },
};

export default plugin;
