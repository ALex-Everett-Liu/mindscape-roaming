import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-keyboard",
  name: "Core: Keyboard Shortcuts",
  version: "1.0.0",
  description:
    "Provides standard keyboard shortcuts for outliner operations (Enter, Tab, Shift+Tab, arrow keys, etc). Disable to use a custom keybinding plugin instead.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
