import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "core-sidebar",
  name: "Core: Sidebar",
  version: "1.0.0",
  description: "Shared right sidebar infrastructure for plugins to register content tabs.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: true,
  enabledByDefault: true,
  dependencies: [],
};
