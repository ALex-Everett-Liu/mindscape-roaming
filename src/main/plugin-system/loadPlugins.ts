import type { MainPlugin } from "./PluginManifest";

// Static imports so bundler includes plugins (dynamic import fails in built output)
import coreNodeOps from "../plugins/core-node-ops/index";
import coreFtsSearch from "../plugins/core-fts-search/index";
import coreSettings from "../plugins/core-settings/index";

const MAIN_PLUGINS: Record<string, MainPlugin> = {
  "core-node-ops": coreNodeOps,
  "core-fts-search": coreFtsSearch,
  "core-settings": coreSettings,
};

/** Load all built-in plugins. Users enable/disable each in Settings. */
export async function loadMainPlugins(): Promise<MainPlugin[]> {
  return Object.values(MAIN_PLUGINS);
}
