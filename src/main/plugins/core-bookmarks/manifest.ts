import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-bookmarks",
  name: "Core: Bookmarks",
  version: "1.0.0",
  description: "Pin outline nodes as bookmarks and access them from a right sidebar tab.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops", "core-sidebar"],
};
