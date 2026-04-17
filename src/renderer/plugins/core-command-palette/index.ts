import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { createCommandPalette } from "./CommandPalette";

let palette: ReturnType<typeof createCommandPalette> | null = null;
let ctxRef: RendererPluginContext | null = null;

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    palette = createCommandPalette(() => ctx.listCommands());
    ctx.registerCommand({
      id: "open-command-palette",
      name: "Command Palette",
      shortcut: "Ctrl+P",
      category: "General",
      keywords: ["palette", "commands", "actions", "search"],
      execute: () => palette?.toggle(),
    });
  },

  async onUnload() {
    palette?.destroy();
    palette = null;
    ctxRef?.unregisterAllCommands();
    ctxRef = null;
  },
};

export default plugin;
