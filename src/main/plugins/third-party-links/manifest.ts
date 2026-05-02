import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "third-party-links",
  name: "Node Links",
  version: "1.0.0",
  description:
    "Create directed, weighted, categorized links between outline nodes. View and manage links in a resizable right sidebar.",
  author: "Community",
  type: "community",
  runtime: "main",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
