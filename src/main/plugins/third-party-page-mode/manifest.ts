import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "third-party-page-mode",
  name: "Page Mode",
  version: "1.0.0",
  description:
    "Turn blocks into pages with [[wikilink]] syntax. Children are hidden from the main tree and accessible by clicking the page link.",
  author: "Community",
  type: "community",
  runtime: "main",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
