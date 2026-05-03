import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "core-workspace",
  name: "Core: Workspace",
  version: "1.0.0",
  description: "Temporary pin workspace — pin nodes for quick access. Clears on app restart.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-sidebar", "core-context-menu"],
};
