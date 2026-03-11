import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "core-drag-drop",
  name: "Core: Drag & Drop",
  version: "1.0.0",
  description:
    "Enables drag-and-drop reparenting: drag a node onto another to make it a child. Reordering uses keyboard shortcuts (Alt+Shift+Up/Down).",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
