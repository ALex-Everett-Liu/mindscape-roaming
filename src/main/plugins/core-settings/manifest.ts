import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-settings",
  name: "Core: Settings",
  version: "1.0.0",
  description: "Plugin management and app preferences.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: true,
  enabledByDefault: true,
  dependencies: [],
};
