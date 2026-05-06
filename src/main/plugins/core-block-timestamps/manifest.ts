import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-block-timestamps",
  name: "Block Timestamps",
  version: "1.0.0",
  description:
    "Right-click any block to see its creation and last-update timestamps in a small popup.",
  author: "Outliner Team",
  type: "core",
  runtime: "main",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
