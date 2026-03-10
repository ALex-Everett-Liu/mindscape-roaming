import Electrobun, { BrowserWindow, BrowserView } from "electrobun/bun";
import { getDatabase, closeDatabase } from "./database/connection";
import { PluginManager } from "./plugin-system/PluginManager";
import { loadMainPlugins } from "./skeletons/loadPlugins";

// ─── Initialize Database ──────────────────────────────
const db = getDatabase();

// ─── Plugin System ────────────────────────────────────
const pluginManager = new PluginManager(db);

const mainPlugins = await loadMainPlugins();
for (const plugin of mainPlugins) {
  pluginManager.register(plugin);
}

await pluginManager.loadAll();

// ─── Build RPC from Plugins ───────────────────────────
const rpcHandlers = pluginManager.buildRpcHandlers();

const outlinerRPC = BrowserView.defineRPC({
  maxRequestTime: 5000,
  handlers: {
    requests: rpcHandlers.requests as any,
  },
});

// ─── Create Main Window ───────────────────────────────
const mainWindow = new BrowserWindow({
  title: "Outliner",
  frame: { x: 0, y: 0, width: 900, height: 700 },
  url: "views://renderer/index.html",
  rpc: outlinerRPC,
});

// ─── App Lifecycle ────────────────────────────────────
Electrobun.events.on("will-quit", async () => {
  await pluginManager.shutdown();
  closeDatabase();
});

mainWindow.on("close", () => {
  Electrobun.Utils.quit();
});
