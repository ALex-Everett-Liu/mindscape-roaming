import type { MainPlugin } from "../../plugin-system/PluginManifest";
import { manifest } from "./manifest";

/**
 * Main-process stub for core-keyboard.
 * The plugin runs in the renderer; this stub registers the manifest
 * so it appears in the plugin list and can be enabled/disabled.
 */
const plugin: MainPlugin = {
  manifest,

  async onLoad() {
    // No-op: actual keyboard handling runs in the renderer
  },
};

export default plugin;
