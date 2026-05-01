import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import type { OutlineTreeNode } from "../../../shared/types";
import { manifest } from "./manifest";
import { api } from "../../rpc/api";
import { store } from "../../state/store";
import {
  exportToJson,
  exportToMarkdown,
  exportToPlainText,
  exportToOpml,
  exportToHtml,
  exportSubtreeToJson,
  exportSubtreeToMarkdown,
  exportSubtreeToPlainText,
  exportSubtreeToOpml,
  exportSubtreeToHtml,
  triggerDownload,
} from "./exportFormats";

let ctxRef: RendererPluginContext | null = null;

function findNode(nodes: OutlineTreeNode[], id: string): OutlineTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

async function doExport(
  format: "json" | "markdown" | "txt" | "opml" | "html"
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
    case "html":
      result = exportToHtml(tree);
      break;
  }

  triggerDownload(result.content, result.filename, result.mimeType);
}

async function doExportSubtree(
  format: "json" | "markdown" | "txt" | "opml" | "html"
): Promise<void> {
  const state = store.getState();
  const focusedId = state.focusedNodeId;
  if (!focusedId) return;

  const node = findNode(state.tree, focusedId);
  if (!node) return;

  let result: { content: string; filename: string; mimeType: string };

  switch (format) {
    case "json":
      result = exportSubtreeToJson(node);
      break;
    case "markdown":
      result = exportSubtreeToMarkdown(node);
      break;
    case "txt":
      result = exportSubtreeToPlainText(node);
      break;
    case "opml":
      result = exportSubtreeToOpml(node);
      break;
    case "html":
      result = exportSubtreeToHtml(node);
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

    ctx.registerCommand({
      id: "export-outline-html",
      name: "Export outline as HTML",
      category: "Data",
      keywords: ["export", "html", "web", "save", "download"],
      execute: () => doExport("html"),
    });

    ctx.registerCommand({
      id: "export-subtree-json",
      name: "Export focused node as JSON",
      category: "Data",
      keywords: ["export", "json", "save", "download", "subtree", "node"],
      execute: () => doExportSubtree("json"),
    });

    ctx.registerCommand({
      id: "export-subtree-markdown",
      name: "Export focused node as Markdown",
      category: "Data",
      keywords: ["export", "markdown", "md", "save", "download", "subtree", "node"],
      execute: () => doExportSubtree("markdown"),
    });

    ctx.registerCommand({
      id: "export-subtree-opml",
      name: "Export focused node as OPML",
      category: "Data",
      keywords: ["export", "opml", "xml", "save", "download", "subtree", "node"],
      execute: () => doExportSubtree("opml"),
    });

    ctx.registerCommand({
      id: "export-subtree-txt",
      name: "Export focused node as plain text",
      category: "Data",
      keywords: ["export", "text", "txt", "plain", "save", "download", "subtree", "node"],
      execute: () => doExportSubtree("txt"),
    });

    ctx.registerCommand({
      id: "export-subtree-html",
      name: "Export focused node as HTML",
      category: "Data",
      keywords: ["export", "html", "web", "save", "download", "subtree", "node"],
      execute: () => doExportSubtree("html"),
    });
  },

  async onUnload() {
    ctxRef?.unregisterAllCommands();
    ctxRef = null;
  },
};

export default plugin;
