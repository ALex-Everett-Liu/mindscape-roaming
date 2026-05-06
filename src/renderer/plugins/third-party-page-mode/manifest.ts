import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "third-party-page-mode",
  name: "Page Mode",
  version: "1.0.0",
  description:
    "Turn blocks into pages with [[wikilink]] syntax. Children are hidden from the main tree and accessible by clicking the page link.",
  author: "Community",
  type: "community",
  runtime: "renderer",
  essential: false,
  enabledByDefault: false,
  dependencies: ["core-node-ops", "core-context-menu"],
};
