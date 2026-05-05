import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "third-party-image-gallery",
  name: "Image Gallery",
  version: "1.0.0",
  description:
    "Browse all images under a node (itself + descendants) with left/right arrow key navigation and fullscreen zoom.",
  author: "Community",
  type: "community",
  runtime: "main",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops", "core-image-viewer"],
};
