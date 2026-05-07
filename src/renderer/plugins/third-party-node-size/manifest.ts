import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "third-party-node-size",
  name: "Node Size",
  version: "1.0.0",
  description:
    "Adjust node size per block and query nodes by size range.",
  author: "Outliner Team",
  type: "community",
  runtime: "renderer",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-context-menu", "core-node-ops"],
};
