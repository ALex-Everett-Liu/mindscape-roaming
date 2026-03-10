import type { Database } from "bun:sqlite";
import type { PluginManifest } from "./PluginManifest";
import type { EventBus } from "./EventBus";
import type { RpcHandlerRegistry } from "./RpcHandlerRegistry";

export class MainPluginContext {
  readonly pluginId: string;

  constructor(
    manifest: PluginManifest,
    private db: Database,
    private eventBus: EventBus,
    private rpcRegistry: RpcHandlerRegistry
  ) {
    this.pluginId = manifest.id;
  }

  getDatabase(): Database {
    return this.db;
  }

  runMigration(version: number, name: string, sql: string): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS _plugin_migrations (
        plugin_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        PRIMARY KEY (plugin_id, version)
      )
    `);

    const applied = this.db
      .query("SELECT 1 FROM _plugin_migrations WHERE plugin_id = ? AND version = ?")
      .get(this.pluginId, version);

    if (applied) return;

    this.db.transaction(() => {
      this.db.run(sql.trim());
      this.db.run(
        "INSERT INTO _plugin_migrations (plugin_id, version, name, applied_at) VALUES (?, ?, ?, ?)",
        [this.pluginId, version, name, Date.now()]
      );
    })();
  }

  registerRpcHandler(
    name: string,
    handler: (params: any) => any | Promise<any>,
    options?: { noPrefix?: boolean }
  ): void {
    const fullName = options?.noPrefix ? name : `${this.pluginId}:${name}`;
    this.rpcRegistry.register(fullName, handler, this.pluginId);
  }

  on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  async emit(event: string, ...args: any[]): Promise<void> {
    return this.eventBus.emit(event, ...args);
  }

  log(...args: any[]): void {
    console.log(`[${this.pluginId}]`, ...args);
  }
}
