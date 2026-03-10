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

// ─── Unsaved state (for close warning) ─────────────────
let hasUnsavedChanges = false;
let userConfirmedQuitDespiteUnsaved = false;

// ─── Build RPC from Plugins ───────────────────────────
const rpcHandlers = pluginManager.buildRpcHandlers();

const outlinerRPC = BrowserView.defineRPC({
  maxRequestTime: 5000,
  handlers: {
    requests: {
      ...(rpcHandlers.requests as Record<string, unknown>),
      reportUnsavedState: (params: unknown) => {
        hasUnsavedChanges = (params as { hasUnsaved: boolean }).hasUnsaved;
        return Promise.resolve();
      },
    },
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
Electrobun.events.on("before-quit", (event: { response?: { allow: boolean } }) => {
  if (hasUnsavedChanges && !userConfirmedQuitDespiteUnsaved) {
    event.response = { allow: false };
    Electrobun.Utils.showMessageBox({
      type: "question",
      title: "Unsaved Changes",
      message: "You have unsaved changes. Quit anyway?",
      buttons: ["Quit", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        userConfirmedQuitDespiteUnsaved = true;
        Electrobun.Utils.quit();
      }
    });
  }
});

Electrobun.events.on("will-quit", async () => {
  await pluginManager.shutdown();
  closeDatabase();
});

mainWindow.on("close", () => {
  Electrobun.Utils.quit();
});
