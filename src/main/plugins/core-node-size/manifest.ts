import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-node-size",
  name: "Node Size",
  version: "1.0.0",
  description:
    "Adjust node size per block and query nodes by size range.",
  author: "Outliner Team",
  type: "core",
  runtime: "main",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
