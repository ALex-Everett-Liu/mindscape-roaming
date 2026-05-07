import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "core-move-node",
  name: "Move Node",
  version: "1.0.0",
  description:
    "Move a node to any parent by searching for the target via command palette or context menu.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops", "core-command-palette", "core-context-menu"],
};
