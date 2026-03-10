import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-fts-search",
  name: "Core: Full-Text Search",
  version: "1.0.0",
  description: "FTS5 full-text search across nodes.",
  author: "Outliner Team",
  type: "core",
  runtime: "main",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
