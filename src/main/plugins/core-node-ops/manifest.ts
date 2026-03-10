import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-node-ops",
  name: "Core: Node Operations",
  version: "1.0.0",
  description: "Outline node CRUD, tree queries, data model.",
  author: "Outliner Team",
  type: "core",
  runtime: "main",
  essential: true,
  enabledByDefault: true,
  dependencies: [],
};
