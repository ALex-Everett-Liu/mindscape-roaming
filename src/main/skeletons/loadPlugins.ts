import type { MainPlugin } from "../plugin-system/PluginManifest";
import { getPluginsForSkeleton, getBuildSkeleton } from "../../../skeletons.config";

// Static imports so bundler includes plugins (dynamic import fails in built output)
import coreNodeOps from "../plugins/core-node-ops/index";
import coreFtsSearch from "../plugins/core-fts-search/index";
import coreSettings from "../plugins/core-settings/index";

const MAIN_PLUGINS: Record<string, MainPlugin> = {
  "core-node-ops": coreNodeOps,
  "core-fts-search": coreFtsSearch,
  "core-settings": coreSettings,
};

export async function loadMainPlugins(): Promise<MainPlugin[]> {
  const skeleton = getBuildSkeleton();
  const ids = new Set(getPluginsForSkeleton(skeleton));

  const plugins: MainPlugin[] = [];
  for (const id of Object.keys(MAIN_PLUGINS)) {
    if (ids.has(id)) plugins.push(MAIN_PLUGINS[id]);
  }
  return plugins;
}
