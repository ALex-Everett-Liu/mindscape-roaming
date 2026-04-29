import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "core-export",
  name: "Core: Export",
  version: "1.0.0",
  description: "Export outline data as JSON, OPML, Markdown, or plain text.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,
  enabledByDefault: true,
};
