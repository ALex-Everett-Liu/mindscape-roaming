import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-move-node",
  name: "Move Node",
  version: "1.0.0",
  description:
    "Move a node to any parent by searching for the target via command palette or context menu.",
  author: "Outliner Team",
  type: "community",
  runtime: "main",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
