import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "third-party-vim-nav",
  name: "Vim Navigation",
  version: "1.0.0",
  description:
    "Alt+V toggles Vim-style keyboard navigation: every node gets a hint label, type the label to jump and edit without the mouse.",
  author: "Community",
  type: "community",
  runtime: "main",
  essential: false,
  enabledByDefault: false,
  dependencies: [],
};
