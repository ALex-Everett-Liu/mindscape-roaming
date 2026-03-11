/**
 * Plugin types shared between main and renderer.
 * Renderer plugins use these; main has extended versions in plugin-system.
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

export interface RendererPlugin {
  manifest: PluginManifest;
  onLoad(context: RendererPluginContext): Promise<void>;
  onUnload?(): Promise<void>;
}

export interface RendererPluginContext {
  pluginId: string;
  on(event: string, handler: (...args: unknown[]) => void): () => void;
  emit(event: string, ...args: unknown[]): Promise<void>;
  registerCommand(command: {
    id: string;
    name: string;
    shortcut?: string;
    execute: () => void | Promise<void>;
  }): void;
}
