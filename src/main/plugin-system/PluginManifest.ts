/**
 * Plugin manifest and lifecycle interfaces.
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: "core" | "community";
  runtime: "main" | "renderer" | "both";
  dependencies?: string[];
  softDependencies?: string[];
  essential?: boolean;
  enabledByDefault?: boolean;
  minAppVersion?: string;
}

/**
 * Main-process plugin: runs in Bun.
 */
export interface MainPlugin {
  manifest: PluginManifest;
  onLoad(context: MainPluginContext): Promise<void>;
  onUnload?(): Promise<void>;
}

/**
 * Renderer-process plugin: runs in BrowserView.
 */
export interface RendererPlugin {
  manifest: PluginManifest;
  onLoad(context: RendererPluginContext): Promise<void>;
  onUnload?(): Promise<void>;
}

// Forward refs — defined in PluginContext and RendererPluginContext
export interface MainPluginContext {
  pluginId: string;
  getDatabase(): import("bun:sqlite").Database;
  runMigration(version: number, name: string, sql: string): void;
  registerRpcHandler(
    name: string,
    handler: (params: any) => any | Promise<any>,
    options?: { noPrefix?: boolean }
  ): void;
  on(event: string, handler: (...args: any[]) => void): () => void;
  emit(event: string, ...args: any[]): Promise<void>;
  log(...args: any[]): void;
}

export interface RendererPluginContext {
  pluginId: string;
  rpc(method: string, params?: any): Promise<any>;
  on(event: string, handler: (...args: any[]) => void): () => void;
  emit(event: string, ...args: any[]): Promise<void>;
  registerUISlot(slotName: string, component: any, options?: { order?: number }): () => void;
  injectCSS(css: string): () => void;
  log(...args: any[]): void;
}
