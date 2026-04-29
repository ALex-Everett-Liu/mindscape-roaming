import type { MainPlugin } from "./PluginManifest";

// Static imports so bundler includes plugins (dynamic import fails in built output)
import coreNodeOps from "../plugins/core-node-ops/index";
import coreFtsSearch from "../plugins/core-fts-search/index";
import coreSettings from "../plugins/core-settings/index";
import coreKeyboard from "../plugins/core-keyboard/index";
import coreDragDrop from "../plugins/core-drag-drop/index";
import coreCommandPalette from "../plugins/core-command-palette/index";
import coreExport from "../plugins/core-export/index";

const MAIN_PLUGINS: Record<string, MainPlugin> = {
  "core-node-ops": coreNodeOps,
  "core-fts-search": coreFtsSearch,
  "core-settings": coreSettings,
  "core-keyboard": coreKeyboard,
  "core-drag-drop": coreDragDrop,
  "core-command-palette": coreCommandPalette,
  "core-export": coreExport,
};

/** Load all built-in plugins. Users enable/disable each in Settings. */
export async function loadMainPlugins(): Promise<MainPlugin[]> {
  return Object.values(MAIN_PLUGINS);
}
