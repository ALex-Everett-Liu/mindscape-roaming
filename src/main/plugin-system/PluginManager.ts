import type { Database } from "bun:sqlite";
import type { MainPlugin, PluginManifest } from "./PluginManifest";
import { MainPluginContext } from "./PluginContext";
import { EventBus, CoreEvents } from "./EventBus";
import { RpcHandlerRegistry } from "./RpcHandlerRegistry";
import { resolveDependencies } from "./DependencyResolver";
import type {
  CreateNodeParams,
  UpdateNodeParams,
  MoveNodeParams,
  IndentNodeParams,
  OutdentNodeParams,
  DeleteNodeParams,
  GetSubtreeParams,
  SearchParams,
} from "../rpc/types";

export class PluginManager {
  private manifests = new Map<string, PluginManifest>();
  private plugins = new Map<string, MainPlugin>();
  private loadedPlugins = new Set<string>();
  private enabledPlugins = new Set<string>();

  readonly eventBus = new EventBus();
  readonly rpcRegistry = new RpcHandlerRegistry();

  constructor(private db: Database) {
    this.initDb(db);
  }

  private initDb(database: Database) {
    database.run(`
      CREATE TABLE IF NOT EXISTS _plugin_state (
        plugin_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.loadEnabledState();
  }

  /** Unload all plugins (for restore). Releases DB refs before close. Does not reload. */
  async unloadAllForRestore(): Promise<void> {
    for (const pluginId of [...this.loadedPlugins].reverse()) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.onUnload) await plugin.onUnload();
      this.rpcRegistry.removeByPlugin(pluginId);
      this.loadedPlugins.delete(pluginId);
    }
  }

  /** Swap database after restore. Unloads and reloads all plugins with new db. */
  async reloadWithNewDatabase(newDb: Database): Promise<void> {
    this.db = newDb;
    this.initDb(newDb);
    const resolution = resolveDependencies(this.manifests, this.enabledPlugins);
    for (const pluginId of resolution.loadOrder) {
      if (this.enabledPlugins.has(pluginId)) await this.loadPlugin(pluginId);
    }
  }

  private loadEnabledState(): void {
    const rows = this.db.query("SELECT plugin_id, enabled FROM _plugin_state").all() as {
      plugin_id: string;
      enabled: number;
    }[];
    for (const r of rows) {
      if (r.enabled) this.enabledPlugins.add(r.plugin_id);
    }
  }

  register(plugin: MainPlugin): void {
    const { manifest } = plugin;
    this.manifests.set(manifest.id, manifest);
    this.plugins.set(manifest.id, plugin);

    const row = this.db.query("SELECT enabled FROM _plugin_state WHERE plugin_id = ?").get(manifest.id) as
      | { enabled: number }
      | null;
    if (!row) {
      const enabled = manifest.essential ?? manifest.enabledByDefault !== false ? 1 : 0;
      this.db.run("INSERT INTO _plugin_state (plugin_id, enabled) VALUES (?, ?)", [manifest.id, enabled]);
      if (enabled) this.enabledPlugins.add(manifest.id);
    }
  }

  async loadAll(): Promise<void> {
    const resolution = resolveDependencies(this.manifests, this.enabledPlugins);

    for (const u of resolution.unresolvable) {
      console.warn(`Plugin "${u.pluginId}" skipped: missing [${u.missingDeps.join(", ")}]`);
    }

    for (const pluginId of resolution.loadOrder) {
      await this.loadPlugin(pluginId);
    }

    await this.eventBus.emit(CoreEvents.APP_READY);
  }

  private async loadPlugin(pluginId: string): Promise<void> {
    if (this.loadedPlugins.has(pluginId)) return;

    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    const ctx = new MainPluginContext(
      plugin.manifest,
      this.db,
      this.eventBus,
      this.rpcRegistry
    );

    try {
      await plugin.onLoad(ctx);
      this.loadedPlugins.add(pluginId);
      console.log(`✓ Loaded plugin: ${plugin.manifest.name} (${pluginId})`);
      await this.eventBus.emit(CoreEvents.PLUGIN_LOADED, pluginId);
    } catch (err) {
      console.error(`✗ Failed to load plugin "${pluginId}":`, err);
    }
  }

  /** Build RPC handlers for BrowserView.defineRPC */
  buildRpcHandlers() {
    const r = this.rpcRegistry;
    const wrap = (name: string, fn?: (p: any) => any) => {
      if (!fn) return () => Promise.resolve({ success: false, error: `Handler ${name} not registered` });
      return (params: any) => Promise.resolve(fn(params));
    };
    return {
      requests: {
        getFullTree: wrap("getFullTree", r.get("getFullTree")),
        getSubtree: (params: GetSubtreeParams) => wrap("getSubtree", r.get("getSubtree"))(params),
        getNode: (params: { id: string }) => wrap("getNode", r.get("getNode"))(params),
        getAncestors: (params: { nodeId: string }) => wrap("getAncestors", r.get("getAncestors"))(params),
        getStats: wrap("getStats", r.get("getStats")),
        createNode: (params: CreateNodeParams) => wrap("createNode", r.get("createNode"))(params),
        updateNode: (params: UpdateNodeParams) => wrap("updateNode", r.get("updateNode"))(params),
        moveNode: (params: MoveNodeParams) => wrap("moveNode", r.get("moveNode"))(params),
        indentNode: (params: IndentNodeParams) => wrap("indentNode", r.get("indentNode"))(params),
        outdentNode: (params: OutdentNodeParams) => wrap("outdentNode", r.get("outdentNode"))(params),
        deleteNode: (params: DeleteNodeParams) => wrap("deleteNode", r.get("deleteNode"))(params),
        search: (params: SearchParams) => wrap("search", r.get("search"))(params),

        // Plugin management (for Settings UI)
        listPlugins: () => Promise.resolve({ success: true, data: this.getPluginList() }),
        enablePlugin: (p: { pluginId: string }) =>
          this.enablePlugin(p.pluginId).then((ok) => (ok ? { success: true, data: true } : { success: false, error: "Failed to enable" })),
        disablePlugin: (p: { pluginId: string }) =>
          this.disablePlugin(p.pluginId).then((ok) => (ok ? { success: true, data: true } : { success: false, error: "Failed to disable" })),
      },
    };
  }

  getPluginList(): Array<PluginManifest & { enabled: boolean; loaded: boolean }> {
    return [...this.manifests.values()].map((m) => ({
      ...m,
      enabled: this.enabledPlugins.has(m.id),
      loaded: this.loadedPlugins.has(m.id),
    }));
  }

  async enablePlugin(pluginId: string): Promise<boolean> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return false;
    for (const depId of manifest.dependencies ?? []) {
      if (!this.loadedPlugins.has(depId)) {
        console.error(`Cannot enable "${pluginId}": dependency "${depId}" not loaded`);
        return false;
      }
    }
    this.enabledPlugins.add(pluginId);
    this.db.run("INSERT OR REPLACE INTO _plugin_state (plugin_id, enabled) VALUES (?, 1)", [pluginId]);
    await this.loadPlugin(pluginId);
    return true;
  }

  async disablePlugin(pluginId: string): Promise<boolean> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return false;
    if (manifest.essential) {
      console.warn(`Cannot disable essential plugin "${pluginId}"`);
      return false;
    }
    for (const [, m] of this.manifests) {
      if (this.loadedPlugins.has(m.id) && m.dependencies?.includes(pluginId)) {
        console.error(`Cannot disable "${pluginId}": "${m.id}" depends on it`);
        return false;
      }
    }
    const plugin = this.plugins.get(pluginId);
    if (plugin && this.loadedPlugins.has(pluginId)) {
      try {
        if (plugin.onUnload) await plugin.onUnload();
      } catch (err) {
        console.error(`Error unloading "${pluginId}":`, err);
      }
      this.rpcRegistry.removeByPlugin(pluginId);
      this.loadedPlugins.delete(pluginId);
    }
    this.enabledPlugins.delete(pluginId);
    this.db.run("INSERT OR REPLACE INTO _plugin_state (plugin_id, enabled) VALUES (?, 0)", [pluginId]);
    await this.eventBus.emit(CoreEvents.PLUGIN_UNLOADED, pluginId);
    return true;
  }

  async shutdown(): Promise<void> {
    await this.eventBus.emit(CoreEvents.APP_WILL_QUIT);
    for (const pluginId of [...this.loadedPlugins].reverse()) {
      const plugin = this.plugins.get(pluginId);
      if (plugin?.onUnload) await plugin.onUnload();
    }
    this.loadedPlugins.clear();
  }
}
