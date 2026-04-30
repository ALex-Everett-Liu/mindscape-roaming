import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "third-party-block-ref",
  name: "Block References",
  version: "1.0.0",
  description:
    "Reference other blocks with ((block-id)) syntax. Hover for a preview, click to jump to the original block.",
  author: "Community",
  type: "community",
  runtime: "main",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
