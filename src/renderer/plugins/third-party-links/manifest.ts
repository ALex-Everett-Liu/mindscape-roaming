import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "third-party-links",
  name: "Node Links",
  version: "1.0.0",
  description:
    "Create directed, weighted, categorized links between outline nodes. View and manage links in a resizable right sidebar.",
  author: "Community",
  type: "community",
  runtime: "renderer",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
