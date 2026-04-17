import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { CoreEvents } from "../../../shared/events";

let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let ctxRef: RendererPluginContext | null = null;

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
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
      category: "Outline",
      keywords: ["root", "new", "node"],
      execute: () => void ctx.emit("action:createRootNode"),
    });

    ctx.registerCommand({
      id: "search-focus",
      name: "Search",
      shortcut: "Ctrl+F",
      category: "Navigation",
      keywords: ["find", "filter"],
      execute: () => void ctx.emit(CoreEvents.SEARCH_OPENED),
    });
  },

  async onUnload() {
    ctxRef?.unregisterAllCommands();
    ctxRef = null;
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler, true);
      keydownHandler = null;
    }
  },
};

export default plugin;
