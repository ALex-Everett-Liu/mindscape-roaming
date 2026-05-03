/**
 * Loads/unloads renderer plugins based on main process enabled state.
 * Shares one EventBus and action bridge so plugins can emit actions.
 */
import type { EventBus } from "./EventBus";
import { CommandRegistry } from "./CommandRegistry";
import { RendererPluginContext } from "./RendererPluginContext";
import { setupActionBridge } from "./actionBridge";
import { EventBus as EventBusClass } from "./EventBus";
import coreKeyboard from "../plugins/core-keyboard";
import coreDragDrop from "../plugins/core-drag-drop";
import coreCommandPalette from "../plugins/core-command-palette";
import coreExport from "../plugins/core-export";
import coreSidebar from "../plugins/core-sidebar";
import coreBookmarks from "../plugins/core-bookmarks";
import coreContextMenu from "../plugins/core-context-menu";
import coreWorkspace from "../plugins/core-workspace";
import thirdPartyBlockRef from "../plugins/third-party-block-ref";
import thirdPartyPageMode from "../plugins/third-party-page-mode";
import thirdPartyLinks from "../plugins/third-party-links";
import { store } from "../state/store";
import { CoreEvents } from "../../shared/events";
import { api } from "../rpc/api";
import type { PluginManifest } from "../../shared/plugin-types";

type RendererPluginId = "core-context-menu" | "core-sidebar" | "core-keyboard" | "core-drag-drop" | "core-command-palette" | "core-export" | "core-bookmarks" | "core-workspace" | "third-party-block-ref" | "third-party-page-mode" | "third-party-links";

const RENDERER_MANIFESTS: Record<RendererPluginId, PluginManifest> = {
  "core-keyboard": coreKeyboard.manifest,
  "core-drag-drop": coreDragDrop.manifest,
  "core-command-palette": coreCommandPalette.manifest,
  "core-export": coreExport.manifest,
  "core-sidebar": coreSidebar.manifest,
  "core-bookmarks": coreBookmarks.manifest,
  "core-context-menu": coreContextMenu.manifest,
  "core-workspace": coreWorkspace.manifest,
  "third-party-block-ref": thirdPartyBlockRef.manifest,
  "third-party-page-mode": thirdPartyPageMode.manifest,
  "third-party-links": thirdPartyLinks.manifest,
};

const RENDERER_PLUGINS: Record<
  RendererPluginId,
  { onLoad: (ctx: RendererPluginContext) => Promise<void>; onUnload?: () => Promise<void> }
> = {
  "core-keyboard": coreKeyboard,
  "core-drag-drop": coreDragDrop,
  "core-command-palette": coreCommandPalette,
  "core-export": coreExport,
  "core-sidebar": coreSidebar,
  "core-bookmarks": coreBookmarks,
  "core-context-menu": coreContextMenu,
  "core-workspace": coreWorkspace,
  "third-party-block-ref": thirdPartyBlockRef,
  "third-party-page-mode": thirdPartyPageMode,
  "third-party-links": thirdPartyLinks,
};

let eventBus: EventBus | null = null;
let commands: CommandRegistry | null = null;
let unsubActionBridge: (() => void) | null = null;
const loadedPlugins = new Set<RendererPluginId>();
const pluginContexts = new Map<RendererPluginId, RendererPluginContext>();

async function ensureRuntime(): Promise<void> {
  if (eventBus) return;
  eventBus = new EventBusClass();
  commands = new CommandRegistry();
  unsubActionBridge = setupActionBridge(eventBus, store);

  eventBus.on(CoreEvents.SEARCH_OPENED, () => {
    window.dispatchEvent(new CustomEvent("focus-search"));
  });
}

async function loadPlugin(pluginId: RendererPluginId): Promise<void> {
  if (loadedPlugins.has(pluginId)) return;
  await ensureRuntime();

  const plugin = RENDERER_PLUGINS[pluginId];
  if (!plugin) return;

  const ctx = new RendererPluginContext(RENDERER_MANIFESTS[pluginId], eventBus!, commands!);
  pluginContexts.set(pluginId, ctx);
  await plugin.onLoad(ctx);
  loadedPlugins.add(pluginId);
}

async function unloadPlugin(pluginId: RendererPluginId): Promise<void> {
  if (!loadedPlugins.has(pluginId)) return;

  const plugin = RENDERER_PLUGINS[pluginId];
  if (plugin?.onUnload) await plugin.onUnload();
  loadedPlugins.delete(pluginId);
  pluginContexts.delete(pluginId);
}

async function tearDownRuntime(): Promise<void> {
  if (loadedPlugins.size > 0) return;
  if (unsubActionBridge) {
    unsubActionBridge();
    unsubActionBridge = null;
  }
  if (commands) {
    commands.destroy();
    commands = null;
  }
  eventBus = null;
}

/**
 * Load renderer plugins based on main process state. Call on app init (after RPC ready).
 */
export async function loadRendererPlugins(): Promise<void> {
  const res = await api.listPlugins();
  if (!res.success || !res.data) return;

  const enabled = new Set(
    res.data.filter((p) => p.enabled).map((p) => p.id as RendererPluginId)
  );

  for (const id of ["core-context-menu", "core-sidebar", "core-keyboard", "core-drag-drop", "core-command-palette", "core-export", "core-bookmarks", "core-workspace", "third-party-block-ref", "third-party-page-mode", "third-party-links"] as const) {
    if (enabled.has(id)) {
      await loadPlugin(id);
    } else {
      await unloadPlugin(id);
    }
  }

  await tearDownRuntime();
}

/**
 * Sync renderer plugin state with main. Call when Settings modal closes.
 */
export async function syncRendererPluginState(): Promise<void> {
  await loadRendererPlugins();
}

/** @deprecated Use loadRendererPlugins */
export async function loadKeyboardPlugin(): Promise<void> {
  await loadRendererPlugins();
}

/** @deprecated Use syncRendererPluginState */
export async function syncKeyboardPluginState(): Promise<void> {
  await syncRendererPluginState();
}
