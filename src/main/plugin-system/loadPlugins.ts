import type { MainPlugin } from "./PluginManifest";

// Static imports so bundler includes plugins (dynamic import fails in built output)
import coreNodeOps from "../plugins/core-node-ops/index";
import coreFtsSearch from "../plugins/core-fts-search/index";
import coreSettings from "../plugins/core-settings/index";
import coreKeyboard from "../plugins/core-keyboard/index";
import coreDragDrop from "../plugins/core-drag-drop/index";
import coreCommandPalette from "../plugins/core-command-palette/index";
import coreExport from "../plugins/core-export/index";
import coreSidebar from "../plugins/core-sidebar/index";
import coreBookmarks from "../plugins/core-bookmarks/index";
import coreContextMenu from "../plugins/core-context-menu/index";
import coreWorkspace from "../plugins/core-workspace/index";
import coreImageViewer from "../plugins/core-image-viewer/index";
import thirdPartyBlockRef from "../plugins/third-party-block-ref/index";
import thirdPartyPageMode from "../plugins/third-party-page-mode/index";
import thirdPartyLinks from "../plugins/third-party-links/index";
import thirdPartyImageGallery from "../plugins/third-party-image-gallery/index";

const MAIN_PLUGINS: Record<string, MainPlugin> = {
  "core-node-ops": coreNodeOps,
  "core-fts-search": coreFtsSearch,
  "core-settings": coreSettings,
  "core-keyboard": coreKeyboard,
  "core-drag-drop": coreDragDrop,
  "core-command-palette": coreCommandPalette,
  "core-export": coreExport,
  "core-sidebar": coreSidebar,
  "core-bookmarks": coreBookmarks,
  "core-context-menu": coreContextMenu,
  "core-workspace": coreWorkspace,
  "core-image-viewer": coreImageViewer,
  "third-party-block-ref": thirdPartyBlockRef,
  "third-party-page-mode": thirdPartyPageMode,
  "third-party-links": thirdPartyLinks,
  "third-party-image-gallery": thirdPartyImageGallery,
};

/** Load all built-in plugins. Users enable/disable each in Settings. */
export async function loadMainPlugins(): Promise<MainPlugin[]> {
  return Object.values(MAIN_PLUGINS);
}
