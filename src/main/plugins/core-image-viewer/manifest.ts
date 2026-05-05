import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-image-viewer",
  name: "Core: Image Viewer",
  version: "1.0.0",
  description: "Render images inline via ![](path) syntax, with fullscreen zoom and resize support.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
  softDependencies: ["core-context-menu", "core-command-palette"],
};
