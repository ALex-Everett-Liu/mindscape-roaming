import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";

const plugin: MainPlugin = {
  manifest,

  async onLoad(_ctx: MainPluginContext) {
    // Context menu is renderer-only.
  },
};

export default plugin;
