import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "core-command-palette",
  name: "Core: Command Palette",
  version: "1.0.0",
  description:
    "Searchable command palette (Ctrl+P) listing registered shortcuts and actions. Disable if you use another launcher.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,
  enabledByDefault: true,
};
