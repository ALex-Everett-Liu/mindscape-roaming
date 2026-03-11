/**
 * Loads the core-keyboard plugin and wires it to the store.
 * Minimal plugin loader for renderer-side plugins.
 */
import { EventBus } from "./EventBus";
import { CommandRegistry } from "./CommandRegistry";
import { RendererPluginContext } from "./RendererPluginContext";
import { setupActionBridge } from "./actionBridge";
import coreKeyboard from "../plugins/core-keyboard";
import { store } from "../state/store";
import { CoreEvents } from "../../shared/events";

let teardownActionBridge: (() => void) | null = null;

export async function loadKeyboardPlugin(): Promise<() => void> {
  const eventBus = new EventBus();
  const commands = new CommandRegistry();

  teardownActionBridge = setupActionBridge(eventBus, store);

  const ctx = new RendererPluginContext(coreKeyboard.manifest, eventBus, commands);
  await coreKeyboard.onLoad(ctx);

  // When SEARCH_OPENED is emitted, dispatch custom event for Toolbar to focus search
  eventBus.on(CoreEvents.SEARCH_OPENED, () => {
    window.dispatchEvent(new CustomEvent("focus-search"));
  });

  return async () => {
    if (teardownActionBridge) {
      teardownActionBridge();
      teardownActionBridge = null;
    }
    if (coreKeyboard.onUnload) {
      await coreKeyboard.onUnload();
    }
    commands.destroy();
  };
}
