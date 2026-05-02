import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-context-menu",
  name: "Core: Context Menu",
  version: "1.0.0",
  description: "Centralized right-click context menu. Other plugins register menu items via the event bus.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: true,
  enabledByDefault: true,
  dependencies: [],
};
