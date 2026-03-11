/**
 * Loads/unloads the core-keyboard plugin based on main process enabled state.
 * Minimal plugin loader for renderer-side plugins.
 */
import { EventBus } from "./EventBus";
import { CommandRegistry } from "./CommandRegistry";
import { RendererPluginContext } from "./RendererPluginContext";
import { setupActionBridge } from "./actionBridge";
import coreKeyboard from "../plugins/core-keyboard";
import { store } from "../state/store";
import { CoreEvents } from "../../shared/events";
import { api } from "../rpc/api";

let teardown: (() => Promise<void>) | null = null;

async function loadCoreKeyboard(): Promise<void> {
  let eventBus: EventBus | null = new EventBus();
  const commands = new CommandRegistry();

  const unsubActionBridge = setupActionBridge(eventBus, store);

  const ctx = new RendererPluginContext(coreKeyboard.manifest, eventBus, commands);
  await coreKeyboard.onLoad(ctx);

  eventBus.on(CoreEvents.SEARCH_OPENED, () => {
    window.dispatchEvent(new CustomEvent("focus-search"));
  });

  teardown = async () => {
    unsubActionBridge();
    if (coreKeyboard.onUnload) await coreKeyboard.onUnload();
    commands.destroy();
    eventBus = null;
    teardown = null;
  };
}

/**
 * Load core-keyboard only if enabled in main. Call on app init (after RPC ready).
 */
export async function loadKeyboardPlugin(): Promise<void> {
  const res = await api.listPlugins();
  const info = res.success && res.data?.find((p) => p.id === "core-keyboard");
  if (info?.enabled) {
    await loadCoreKeyboard();
  }
}

/**
 * Sync keyboard plugin state with main. Call when Settings modal closes.
 * Unloads if disabled, loads if enabled.
 */
export async function syncKeyboardPluginState(): Promise<void> {
  const res = await api.listPlugins();
  const info = res.success && res.data?.find((p) => p.id === "core-keyboard");
  const shouldBeLoaded = !!info?.enabled;

  if (teardown && !shouldBeLoaded) {
    await teardown();
  } else if (!teardown && shouldBeLoaded) {
    await loadCoreKeyboard();
  }
}
