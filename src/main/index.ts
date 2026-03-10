import Electrobun, { BrowserWindow, BrowserView } from "electrobun/bun";
import { getDatabase, closeDatabase, ensureBackup, restoreFromBackup, commitSave, hasBackup } from "./database/connection";
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
const baseHandlers = pluginManager.buildRpcHandlers();
const mutatingOps = ["createNode", "updateNode", "moveNode", "indentNode", "outdentNode", "deleteNode"];

const wrapMutating = (name: string, fn: (params: unknown) => Promise<unknown>) => {
  return async (params: unknown) => {
    ensureBackup();
    return fn(params);
  };
};

const requests: Record<string, (params: unknown) => Promise<unknown>> = {
  ...(baseHandlers.requests as Record<string, (params: unknown) => Promise<unknown>>),
  reportUnsavedState: (params: unknown) => {
    hasUnsavedChanges = (params as { hasUnsaved: boolean }).hasUnsaved;
    return Promise.resolve();
  },
  commitSave: async () => {
    commitSave();
    return Promise.resolve({ success: true });
  },
  restoreFromBackup: async () => {
    console.log("[Outliner] restoreFromBackup RPC handler called");
    await pluginManager.unloadAllForRestore();
    console.log("[Outliner] Plugins unloaded, calling restoreFromBackup()");
    const result = restoreFromBackup();
    console.log("[Outliner] restoreFromBackup() returned:", result);
    if (result.success) {
      try {
        console.log("[Outliner] Reloading plugins with new DB");
        await pluginManager.reloadWithNewDatabase(getDatabase());
        console.log("[Outliner] Plugin reload done");
      } catch (e) {
        console.error("[Outliner] Plugin reload after restore failed:", e);
        return { success: false, error: String(e) };
      }
    }
    console.log("[Outliner] Returning:", { success: result.success, error: result.error });
    return { success: result.success, error: result.error };
  },
  hasBackup: () => Promise.resolve({ success: true, data: hasBackup() }),
};

for (const name of mutatingOps) {
  const fn = requests[name];
  if (fn) requests[name] = wrapMutating(name, fn);
}

const outlinerRPC = BrowserView.defineRPC({
  maxRequestTime: 10000,
  handlers: { requests },
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
