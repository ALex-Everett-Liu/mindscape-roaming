import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { CoreEvents } from "../../../shared/events";

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    keydownHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Only handle events from node editors
      if (!target.classList.contains("node-editor")) return;

      const nodeId = target.dataset.nodeId;
      if (!nodeId) return;

      switch (e.key) {
        case "Enter":
          if (!e.shiftKey) {
            e.preventDefault();
            void ctx.emit("action:createNodeAfter", nodeId);
          }
          break;

        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            void ctx.emit("action:outdentNode", nodeId);
          } else {
            void ctx.emit("action:indentNode", nodeId);
          }
          break;

        case "Backspace":
          if (target.textContent === "") {
            e.preventDefault();
            void ctx.emit("action:deleteNode", nodeId);
          }
          break;

        case "ArrowUp":
          if (e.altKey && e.shiftKey) {
            e.preventDefault();
            void ctx.emit("action:moveNodeUp", nodeId);
          } else if (e.altKey) {
            e.preventDefault();
            void ctx.emit("action:focusPrevious", nodeId);
          }
          break;

        case "ArrowDown":
          if (e.altKey && e.shiftKey) {
            e.preventDefault();
            void ctx.emit("action:moveNodeDown", nodeId);
          } else if (e.altKey) {
            e.preventDefault();
            void ctx.emit("action:focusNext", nodeId);
          }
          break;

        case "Escape":
          e.preventDefault();
          target.blur();
          break;
      }
    };

    document.addEventListener("keydown", keydownHandler, true);

    ctx.registerCommand({
      id: "new-root-node",
      name: "Create New Root Node",
      shortcut: "Ctrl+Enter",
      execute: () => void ctx.emit("action:createRootNode"),
    });

    ctx.registerCommand({
      id: "search-focus",
      name: "Search",
      shortcut: "Ctrl+F",
      execute: () => void ctx.emit(CoreEvents.SEARCH_OPENED),
    });
  },

  async onUnload() {
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler, true);
      keydownHandler = null;
    }
  },
};

export default plugin;
