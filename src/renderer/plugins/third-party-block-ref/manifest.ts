import type { PluginManifest } from "../../../shared/plugin-types";

export const manifest: PluginManifest = {
  id: "third-party-block-ref",
  name: "Block References",
  version: "1.0.0",
  description:
    "Render ((block-id)) as clickable references to other blocks with hover previews.",
  author: "Community",
  type: "community",
  runtime: "renderer",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
