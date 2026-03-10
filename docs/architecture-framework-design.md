
# Plugin System Design for Electrobun Outliner

## Design Philosophy

Inspired by Obsidian.md, our plugin system treats **almost every feature as a plugin** — including core outliner functionality. The app shell is minimal: it only provides the plugin loader, the database connection, the RPC bridge, and a bare UI frame. Everything else — the tree renderer, keyboard shortcuts, search, drag-and-drop, export — is a plugin.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Electrobun Outliner                          │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      APP SHELL (minimal)                      │  │
│  │  • PluginManager (load, enable, disable, dependency resolve)  │  │
│  │  • Database connection (bun:sqlite)                           │  │
│  │  • RPC bridge (electrobun)                                    │  │
│  │  • EventBus (cross-plugin communication)                      │  │
│  │  • UI Frame (empty <div id="app">)                            │  │
│  └──────────────────────────┬─────────────────────────────────────┘  │
│                             │                                       │
│              ┌──────────────┴──────────────┐                        │
│              ▼                             ▼                        │
│  ┌─────────────────────┐     ┌──────────────────────────┐          │
│  │   BUILT-IN PLUGINS  │     │   THIRD-PARTY PLUGINS    │          │
│  │   (ship with app)   │     │   (user-installed)        │          │
│  │                     │     │                          │          │
│  │  core-tree-view     │     │  plugin-kanban-view      │          │
│  │  core-editor        │     │  plugin-pomodoro         │          │
│  │  core-keyboard      │     │  plugin-export-markdown  │          │
│  │  core-search        │     │  plugin-ai-completion    │          │
│  │  core-drag-drop     │     │  plugin-vim-keys         │          │
│  │  core-breadcrumb    │     │  plugin-custom-theme     │          │
│  │  core-zoom          │     │  ...                     │          │
│  │  core-node-ops      │     │                          │          │
│  │  core-toolbar       │     │                          │          │
│  │  core-undo-redo     │     │                          │          │
│  │  core-fts-search    │     │                          │          │
│  │  core-theme         │     │                          │          │
│  └─────────────────────┘     └──────────────────────────┘          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## App Skeletons: Configurable, Slimmable Bundles

Instead of an all-in-one bundled app, the outliner uses **skeletons** — named configurations that define which built-in plugins are included and enabled. You can ship different app variants (minimal vs full) or let users pick a profile at runtime.

### Skeleton Levels

| Skeleton      | Purpose                              | Built-ins Included                                      | Use Case                    |
|---------------|--------------------------------------|---------------------------------------------------------|-----------------------------|
| `minimal`     | Smallest viable outliner             | core-node-ops, core-tree-view, core-editor, core-theme, core-settings | Fast startup, embedded, CLI |
| `standard`    | Default daily-use experience         | Above + keyboard, toolbar, search, undo-redo           | Most users                  |
| `full`        | All built-in features                | Above + FTS, drag-drop, breadcrumb, zoom, context-menu  | Power users                 |
| `custom`      | User-defined profile                 | User selects from available built-ins                   | Per-user tuning             |

### Build-Time vs Runtime

- **Build-time**: `SKELETON=minimal bun run build` excludes unused plugins from the bundle. Smaller binary, faster cold start.
- **Runtime**: Users can switch profiles in Settings. Disabling a plugin unloads it; re-enabling loads it. No rebuild needed.

### Skeleton Configuration Flow

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  skeletons.config.ts    │     │  electrobun.config.ts  │
│  Defines:               │     │  build.plugins:         │
│  • Available skeletons  │     │  • Include list (from   │
│  • Plugin → skeleton map │     │    skeleton) OR         │
│  • Default skeleton     │     │  • "all" for dev        │
└───────────┬─────────────┘     └────────────┬────────────┘
            │                                 │
            └──────────────┬──────────────────┘
                           ▼
            ┌──────────────────────────────┐
            │  Plugin Registry Loader      │
            │  • Only imports plugins in   │
            │    current skeleton          │
            │  • Tree-shaking removes      │
            │    excluded plugins          │
            └──────────────────────────────┘
```

---

## Updated Project Structure

```
electrobun-outliner/
├── electrobun.config.ts
├── skeletons.config.ts              # Skeleton definitions + plugin → skeleton map
├── package.json
├── src/
│   ├── main/                              # Bun process
│   │   ├── index.ts                       # Minimal shell bootstrap
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   └── migrations.ts             # Only plugin-system tables
│   │   ├── plugin-system/
│   │   │   ├── PluginManager.ts          # Core plugin lifecycle manager
│   │   │   ├── PluginContext.ts          # API surface exposed to plugins
│   │   │   ├── PluginManifest.ts         # Manifest type definitions
│   │   │   ├── PluginStore.ts            # Enable/disable state persistence
│   │   │   ├── HookRegistry.ts          # Extension point (hook) system
│   │   │   ├── EventBus.ts              # Cross-plugin event bus
│   │   │   └── DependencyResolver.ts    # Topological sort for load order
│   │   ├── rpc/
│   │   │   ├── rpc-registry.ts           # Dynamic RPC handler registration
│   │   │   └── types.ts
│   │   ├── skeletons/
│   │   │   └── loadPlugins.ts            # Skeleton-aware plugin loader (main)
│   │   └── plugins/                       # Built-in plugins (main-side)
│   │       ├── core-node-ops/
│   │       │   ├── manifest.ts
│   │       │   ├── index.ts              # Plugin entry
│   │       │   ├── migrations.ts         # outline_nodes table
│   │       │   ├── repository.ts
│   │       │   └── service.ts
│   │       ├── core-fts-search/
│   │       │   ├── manifest.ts
│   │       │   ├── index.ts
│   │       │   └── migrations.ts         # FTS5 tables
│   │       ├── core-undo-redo/
│   │       │   ├── manifest.ts
│   │       │   ├── index.ts
│   │       │   └── command-stack.ts
│   │       └── core-settings/
│   │           ├── manifest.ts
│   │           └── index.ts
│   │
│   └── renderer/                          # BrowserView
│       ├── index.html
│       ├── index.ts                       # Minimal shell bootstrap
│       ├── plugin-system/
│       │   ├── RendererPluginManager.ts  # Frontend plugin lifecycle
│       │   ├── RendererPluginContext.ts   # API surface for UI plugins
│       │   ├── UISlotRegistry.ts         # Named UI slots for injection
│       │   ├── CommandPalette.ts         # Plugin-registered commands
│       │   └── SettingsRegistry.ts       # Plugin settings panels
│       ├── skeletons/
│       │   └── loadPlugins.ts            # Skeleton-aware plugin loader (renderer)
│       ├── shell/
│       │   ├── AppShell.ts               # Minimal frame with slots
│       │   └── PluginSettingsView.ts     # Enable/disable UI
│       └── plugins/                       # Built-in plugins (renderer-side)
│           ├── core-tree-view/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   ├── OutlineTree.ts
│           │   └── OutlineNode.ts
│           ├── core-editor/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── NodeEditor.ts
│           ├── core-keyboard/
│           │   ├── manifest.ts
│           │   └── index.ts
│           ├── core-search/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── SearchPanel.ts
│           ├── core-breadcrumb/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── Breadcrumb.ts
│           ├── core-zoom/
│           │   ├── manifest.ts
│           │   └── index.ts
│           ├── core-drag-drop/
│           │   ├── manifest.ts
│           │   └── index.ts
│           ├── core-toolbar/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── Toolbar.ts
│           ├── core-theme/
│           │   ├── manifest.ts
│           │   ├── index.ts
│           │   └── default-theme.css
│           └── core-context-menu/
│               ├── manifest.ts
│               └── index.ts
│
├── plugins/                               # Third-party plugins directory
│   └── .gitkeep
│
└── data/
    └── outliner.db
```

---

## 0. Skeletons Configuration & Plugin Loading

### 0.1 Skeletons Config

```typescript
// skeletons.config.ts

export type SkeletonId = "minimal" | "standard" | "full";

const MINIMAL_PLUGINS = [
  "core-node-ops", "core-tree-view", "core-editor", "core-theme", "core-settings",
];

export const SKELETONS: Record<SkeletonId, string[]> = {
  minimal: [...MINIMAL_PLUGINS],
  standard: [
    ...MINIMAL_PLUGINS,
    "core-keyboard", "core-toolbar", "core-search", "core-undo-redo",
  ],
  full: [
    ...MINIMAL_PLUGINS,
    "core-keyboard", "core-toolbar", "core-search", "core-undo-redo",
    "core-fts-search", "core-drag-drop", "core-breadcrumb", "core-zoom", "core-context-menu",
  ],
};

export const DEFAULT_SKELETON: SkeletonId = "standard";

export function getPluginsForSkeleton(skeleton: SkeletonId): string[] {
  return [...SKELETONS[skeleton]];
}

/** For build: which skeleton to bundle. Set via SKELETON env at build time. */
export function getBuildSkeleton(): SkeletonId {
  const env = (typeof process !== "undefined" ? process.env?.SKELETON : undefined) as SkeletonId | undefined;
  if (env && SKELETONS[env]) return env;
  return DEFAULT_SKELETON;
}
```

### 0.2 Main Process Plugin Loader

```typescript
// src/main/skeletons/loadPlugins.ts

import type { MainPlugin } from "../plugin-system/PluginManifest";
import { getPluginsForSkeleton, getBuildSkeleton } from "../../../skeletons.config";

const MAIN_PLUGIN_IDS = [
  "core-node-ops", "core-fts-search", "core-undo-redo", "core-settings",
] as const;

/** Dynamically load only the main-process plugins in the current skeleton. */
export async function loadMainPlugins(): Promise<MainPlugin[]> {
  const skeleton = getBuildSkeleton();
  const ids = new Set(getPluginsForSkeleton(skeleton));

  const plugins: MainPlugin[] = [];

  for (const id of MAIN_PLUGIN_IDS) {
    if (!ids.has(id)) continue;

    const mod = await import(`../plugins/${id}/index`);
    if (mod?.default?.manifest) {
      plugins.push(mod.default);
    }
  }

  return plugins;
}
```

### 0.3 Renderer Process Plugin Loader

```typescript
// src/renderer/skeletons/loadPlugins.ts

import type { RendererPlugin } from "../../main/plugin-system/PluginManifest";
import { getPluginsForSkeleton, getBuildSkeleton } from "../../../skeletons.config";

const RENDERER_PLUGIN_IDS = [
  "core-tree-view", "core-editor", "core-keyboard", "core-search",
  "core-breadcrumb", "core-zoom", "core-drag-drop", "core-toolbar",
  "core-theme", "core-context-menu",
] as const;

/** Dynamically load only the renderer plugins in the current skeleton. */
export async function loadRendererPlugins(): Promise<RendererPlugin[]> {
  const skeleton = getBuildSkeleton();
  const ids = new Set(getPluginsForSkeleton(skeleton));

  const plugins: RendererPlugin[] = [];

  for (const id of RENDERER_PLUGIN_IDS) {
    if (!ids.has(id)) continue;

    const mod = await import(`../plugins/${id}/index`);
    if (mod?.default?.manifest) {
      plugins.push(mod.default);
    }
  }

  return plugins;
}
```

### 0.4 Build-Time Tree-Shaking (Optional)

Dynamic `import(\`../plugins/${id}/index\`)` may pull all plugins into the bundle. For the smallest builds, add a build script that generates a skeleton-specific loader:

```bash
# package.json
"scripts": {
  "build:minimal": "SKELETON=minimal bun run build",
  "build:standard": "SKELETON=standard bun run build",
  "build:full": "SKELETON=full bun run build"
}
```

A codegen step can emit `loadPlugins.generated.ts` with static imports only for the chosen skeleton, so the bundler tree-shakes unused plugins.

### 0.5 Electrobun Build Config (Skeleton Support)

```typescript
// electrobun.config.ts
import type { ElectrobunConfig } from "electrobun";
import { getBuildSkeleton } from "./skeletons.config";

const skeleton = getBuildSkeleton();

const config: ElectrobunConfig = {
  name: "Outliner",
  identifier: "sh.blackboard.outliner",
  version: "0.1.0",
  main: "./src/main/index.ts",
  renderer: { index: "./src/renderer/index.html" },
  build: {
    target: "bun",
    /** Exclude plugins not in skeleton from bundle (via env / tree-shaking). */
    env: { SKELETON: skeleton },
  },
};

export default config;
```

---

## 1. Plugin Manifest & Types

```typescript
// src/main/plugin-system/PluginManifest.ts

/**
 * Every plugin — built-in or third-party — must declare a manifest.
 */
export interface PluginManifest {
  /** Unique plugin identifier (reverse-domain style) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Semantic version */
  version: string;

  /** Short description shown in settings */
  description: string;

  /** Plugin author */
  author: string;

  /**
   * Plugin category:
   * - "core": Ships with app, cannot be uninstalled (only disabled)
   * - "community": Third-party, can be installed/uninstalled
   */
  type: "core" | "community";

  /**
   * Where this plugin runs:
   * - "main": Only in Bun process (data, services)
   * - "renderer": Only in BrowserView (UI)
   * - "both": Has code in both processes
   */
  runtime: "main" | "renderer" | "both";

  /**
   * Plugin IDs this plugin depends on.
   * These will be loaded first. Circular deps are rejected.
   */
  dependencies?: string[];

  /**
   * Optional: plugins that, if present, this plugin integrates with.
   * Unlike dependencies, soft deps won't block loading if absent.
   */
  softDependencies?: string[];

  /**
   * If true, the plugin cannot be disabled (e.g., core-node-ops).
   * Only for absolutely essential core plugins.
   */
  essential?: boolean;

  /**
   * Minimum app version required. */
  minAppVersion?: string;

  /**
   * Whether enabled by default on first install. */
  enabledByDefault?: boolean;
}


// ─── Plugin Lifecycle Interfaces ──────────────────────

/**
 * Main-process plugin interface.
 * Plugins implement this to hook into the Bun/main process.
 */
export interface MainPlugin {
  manifest: PluginManifest;

  /**
   * Called when the plugin is loaded. Receive context for
   * registering RPC handlers, hooks, event listeners, DB migrations.
   */
  onLoad(context: MainPluginContext): Promise<void>;

  /**
   * Called when the plugin is being unloaded (disabled at runtime).
   * Clean up any resources, deregister handlers.
   */
  onUnload(): Promise<void>;
}

/**
 * Renderer-process plugin interface.
 * Plugins implement this to hook into the BrowserView UI.
 */
export interface RendererPlugin {
  manifest: PluginManifest;

  /**
   * Called when the plugin is loaded in the renderer.
   * Register UI slots, commands, keybindings, styles.
   */
  onLoad(context: RendererPluginContext): Promise<void>;

  /**
   * Called when the plugin is being unloaded.
   * Remove injected UI, clean up listeners.
   */
  onUnload(): Promise<void>;
}

// Forward declarations — defined in their own files
export interface MainPluginContext {}
export interface RendererPluginContext {}
```

---

## 2. Event Bus (Cross-Plugin Communication)

```typescript
// src/main/plugin-system/EventBus.ts

export type EventHandler = (...args: any[]) => void | Promise<void>;

/**
 * A typed event bus that allows plugins to communicate
 * without direct dependencies on each other.
 *
 * Works identically on both main and renderer sides.
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private onceHandlers = new Map<string, Set<EventHandler>>();

  /**
   * Subscribe to an event.
   * Returns an unsubscribe function.
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Subscribe to an event, auto-unsubscribe after first call.
   */
  once(event: string, handler: EventHandler): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);
  }

  /**
   * Emit an event to all subscribers.
   */
  async emit(event: string, ...args: any[]): Promise<void> {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        await handler(...args);
      }
    }

    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        await handler(...args);
      }
      this.onceHandlers.delete(event);
    }
  }

  /**
   * Remove all handlers for an event (used during plugin unload).
   */
  removeAllForEvent(event: string): void {
    this.handlers.delete(event);
    this.onceHandlers.delete(event);
  }

  /**
   * Remove a specific handler from all events (used during plugin unload).
   */
  removeHandler(handler: EventHandler): void {
    for (const [, handlers] of this.handlers) {
      handlers.delete(handler);
    }
    for (const [, handlers] of this.onceHandlers) {
      handlers.delete(handler);
    }
  }
}

// ─── Well-Known Events ────────────────────────────────
// These are documented event names that plugins can rely on.
// Plugins can also define their own custom events.

export const CoreEvents = {
  // Node lifecycle
  NODE_CREATED: "node:created",           // (node: OutlineNode)
  NODE_UPDATED: "node:updated",           // (node: OutlineNode, changes: Partial<OutlineNode>)
  NODE_DELETED: "node:deleted",           // (nodeId: string)
  NODE_MOVED: "node:moved",              // (node: OutlineNode, oldParent: string, newParent: string)
  NODE_INDENTED: "node:indented",         // (node: OutlineNode)
  NODE_OUTDENTED: "node:outdented",       // (node: OutlineNode)

  // Tree state
  TREE_LOADED: "tree:loaded",             // (tree: OutlineTreeNode[])
  ZOOM_CHANGED: "zoom:changed",           // (nodeId: string | null)

  // Plugin lifecycle
  PLUGIN_LOADED: "plugin:loaded",         // (pluginId: string)
  PLUGIN_UNLOADED: "plugin:unloaded",     // (pluginId: string)

  // UI events (renderer only)
  NODE_FOCUSED: "ui:node:focused",        // (nodeId: string | null)
  NODE_EXPANDED: "ui:node:expanded",      // (nodeId: string)
  NODE_COLLAPSED: "ui:node:collapsed",    // (nodeId: string)
  SEARCH_OPENED: "ui:search:opened",
  SEARCH_CLOSED: "ui:search:closed",

  // App lifecycle
  APP_READY: "app:ready",
  APP_WILL_QUIT: "app:will-quit",
} as const;
```

---

## 3. Hook Registry (Extension Points)

```typescript
// src/main/plugin-system/HookRegistry.ts

/**
 * Hooks are synchronous extension points that allow plugins to
 * modify data as it flows through the system.
 *
 * Unlike events (fire-and-forget), hooks are a pipeline:
 * each handler receives the output of the previous one.
 *
 * Example: A "markdown" plugin can hook into "node:render"
 * to transform node content before display.
 */

export type HookHandler<T = any> = (value: T, ...args: any[]) => T | Promise<T>;

export class HookRegistry {
  private hooks = new Map<string, { handler: HookHandler; priority: number; pluginId: string }[]>();

  /**
   * Register a hook handler.
   * @param hookName - The hook to tap into
   * @param handler - Transform function
   * @param priority - Lower = runs first (default 100)
   * @param pluginId - For cleanup on unload
   */
  register(
    hookName: string,
    handler: HookHandler,
    priority: number = 100,
    pluginId: string = "unknown"
  ): void {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }

    const list = this.hooks.get(hookName)!;
    list.push({ handler, priority, pluginId });
    list.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Run all handlers for a hook in pipeline fashion.
   * The output of each handler is passed as input to the next.
   */
  async apply<T>(hookName: string, initialValue: T, ...args: any[]): Promise<T> {
    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) return initialValue;

    let value = initialValue;
    for (const { handler } of handlers) {
      value = await handler(value, ...args);
    }
    return value;
  }

  /**
   * Synchronous version for performance-critical paths.
   */
  applySync<T>(hookName: string, initialValue: T, ...args: any[]): T {
    const handlers = this.hooks.get(hookName);
    if (!handlers || handlers.length === 0) return initialValue;

    let value = initialValue;
    for (const { handler } of handlers) {
      const result = handler(value, ...args);
      if (result instanceof Promise) {
        throw new Error(`Hook "${hookName}" handler returned Promise in sync context`);
      }
      value = result;
    }
    return value;
  }

  /**
   * Remove all hooks registered by a specific plugin.
   */
  removeByPlugin(pluginId: string): void {
    for (const [hookName, handlers] of this.hooks) {
      const filtered = handlers.filter((h) => h.pluginId !== pluginId);
      if (filtered.length === 0) {
        this.hooks.delete(hookName);
      } else {
        this.hooks.set(hookName, filtered);
      }
    }
  }
}

// ─── Well-Known Hooks ─────────────────────────────────

export const CoreHooks = {
  /**
   * Transform node content before saving to DB.
   * Pipeline: string → string
   */
  NODE_CONTENT_BEFORE_SAVE: "node:content:beforeSave",

  /**
   * Transform node content before rendering in UI.
   * Pipeline: string → string (or HTML string)
   */
  NODE_CONTENT_RENDER: "node:content:render",

  /**
   * Modify the tree structure before sending to renderer.
   * Pipeline: OutlineTreeNode[] → OutlineTreeNode[]
   */
  TREE_BEFORE_RENDER: "tree:beforeRender",

  /**
   * Add extra context menu items for a node.
   * Pipeline: MenuItem[] → MenuItem[]
   */
  NODE_CONTEXT_MENU: "node:contextMenu",

  /**
   * Modify node data before creation.
   * Pipeline: CreateNodeParams → CreateNodeParams
   */
  NODE_BEFORE_CREATE: "node:beforeCreate",

  /**
   * Modify node data before deletion. Return null to cancel.
   * Pipeline: DeleteNodeParams → DeleteNodeParams | null
   */
  NODE_BEFORE_DELETE: "node:beforeDelete",

  /**
   * Add items to the toolbar.
   * Pipeline: ToolbarItem[] → ToolbarItem[]
   */
  TOOLBAR_ITEMS: "toolbar:items",

  /**
   * Add CSS class names to a node's container.
   * Pipeline: string[] → string[]
   */
  NODE_CSS_CLASSES: "node:cssClasses",

  /**
   * Add items to the status bar.
   * Pipeline: StatusBarItem[] → StatusBarItem[]
   */
  STATUSBAR_ITEMS: "statusbar:items",
} as const;
```

---

## 4. Plugin Context (API Surface Exposed to Plugins)

### 4.1 Main Process Context

```typescript
// src/main/plugin-system/PluginContext.ts

import { Database } from "bun:sqlite";
import { EventBus } from "./EventBus";
import { HookRegistry } from "./HookRegistry";
import type { PluginManifest } from "./PluginManifest";

/**
 * The API surface that main-process plugins receive.
 * This is the ONLY way plugins interact with the app core.
 * Plugins never import from other plugins directly.
 */
export class MainPluginContext {
  readonly pluginId: string;
  readonly pluginDataDir: string;

  constructor(
    manifest: PluginManifest,
    private db: Database,
    private eventBus: EventBus,
    private hookRegistry: HookRegistry,
    private rpcRegistry: RpcHandlerRegistry,
    private settingsStore: PluginSettingsStore,
    appDataDir: string
  ) {
    this.pluginId = manifest.id;
    this.pluginDataDir = `${appDataDir}/plugins/${manifest.id}`;
  }

  // ─── Database Access ────────────────────────────────

  /**
   * Get the shared SQLite database instance.
   * Plugins can create their own tables (prefixed with plugin id).
   */
  getDatabase(): Database {
    return this.db;
  }

  /**
   * Run a migration for this plugin.
   * Migrations are tracked per-plugin in _plugin_migrations table.
   */
  runMigration(version: number, name: string, sql: string): void {
    const applied = this.db
      .query(
        "SELECT version FROM _plugin_migrations WHERE plugin_id = ? AND version = ?"
      )
      .get(this.pluginId, version);

    if (applied) return;

    this.db.transaction(() => {
      const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        this.db.run(stmt);
      }
      this.db.run(
        "INSERT INTO _plugin_migrations (plugin_id, version, name, applied_at) VALUES (?, ?, ?, ?)",
        [this.pluginId, version, name, Date.now()]
      );
    })();
  }

  // ─── Events ─────────────────────────────────────────

  /**
   * Subscribe to an event. Automatically cleaned up on unload.
   */
  on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  /**
   * Emit an event for other plugins to receive.
   */
  emit(event: string, ...args: any[]): Promise<void> {
    return this.eventBus.emit(event, ...args);
  }

  // ─── Hooks ──────────────────────────────────────────

  /**
   * Register a hook handler to transform data in a pipeline.
   */
  addHook<T>(hookName: string, handler: (value: T, ...args: any[]) => T, priority?: number): void {
    this.hookRegistry.register(hookName, handler, priority, this.pluginId);
  }

  /**
   * Apply a hook pipeline. Used by plugins that define extension points.
   */
  applyHook<T>(hookName: string, initialValue: T, ...args: any[]): Promise<T> {
    return this.hookRegistry.apply(hookName, initialValue, ...args);
  }

  applyHookSync<T>(hookName: string, initialValue: T, ...args: any[]): T {
    return this.hookRegistry.applySync(hookName, initialValue, ...args);
  }

  // ─── RPC Handlers ──────────────────────────────────

  /**
   * Register an RPC handler that the renderer can call.
   * Handler name is auto-prefixed: `pluginId:handlerName`
   * Core plugins can opt out of prefixing.
   */
  registerRpcHandler(
    name: string,
    handler: (params: any) => any | Promise<any>,
    options?: { noPrefix?: boolean }
  ): void {
    const fullName = options?.noPrefix ? name : `${this.pluginId}:${name}`;
    this.rpcRegistry.register(fullName, handler, this.pluginId);
  }

  // ─── Settings ───────────────────────────────────────

  /**
   * Get a setting value for this plugin.
   */
  getSetting<T>(key: string, defaultValue: T): T {
    return this.settingsStore.get(this.pluginId, key, defaultValue);
  }

  /**
   * Set a setting value for this plugin.
   */
  setSetting<T>(key: string, value: T): void {
    this.settingsStore.set(this.pluginId, key, value);
  }

  // ─── Logging ────────────────────────────────────────

  log(...args: any[]): void {
    console.log(`[${this.pluginId}]`, ...args);
  }

  warn(...args: any[]): void {
    console.warn(`[${this.pluginId}]`, ...args);
  }

  error(...args: any[]): void {
    console.error(`[${this.pluginId}]`, ...args);
  }
}


// ─── Supporting Types ─────────────────────────────────

export class RpcHandlerRegistry {
  private handlers = new Map<string, { handler: Function; pluginId: string }>();

  register(name: string, handler: Function, pluginId: string): void {
    if (this.handlers.has(name)) {
      console.warn(`RPC handler "${name}" is being overridden by plugin "${pluginId}"`);
    }
    this.handlers.set(name, { handler, pluginId });
  }

  get(name: string): Function | undefined {
    return this.handlers.get(name)?.handler;
  }

  removeByPlugin(pluginId: string): void {
    for (const [name, entry] of this.handlers) {
      if (entry.pluginId === pluginId) {
        this.handlers.delete(name);
      }
    }
  }

  getAllHandlers(): Map<string, Function> {
    const result = new Map<string, Function>();
    for (const [name, entry] of this.handlers) {
      result.set(name, entry.handler);
    }
    return result;
  }
}

export class PluginSettingsStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS _plugin_settings (
        plugin_id TEXT NOT NULL,
        key       TEXT NOT NULL,
        value     TEXT,
        PRIMARY KEY (plugin_id, key)
      )
    `);
  }

  get<T>(pluginId: string, key: string, defaultValue: T): T {
    const row = this.db
      .query("SELECT value FROM _plugin_settings WHERE plugin_id = ? AND key = ?")
      .get(pluginId, key) as { value: string } | null;

    if (!row) return defaultValue;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  set<T>(pluginId: string, key: string, value: T): void {
    this.db.run(
      `INSERT OR REPLACE INTO _plugin_settings (plugin_id, key, value) VALUES (?, ?, ?)`,
      [pluginId, key, JSON.stringify(value)]
    );
  }

  removeByPlugin(pluginId: string): void {
    this.db.run("DELETE FROM _plugin_settings WHERE plugin_id = ?", [pluginId]);
  }
}
```

### 4.2 Renderer Process Context

```typescript
// src/renderer/plugin-system/RendererPluginContext.ts

import { EventBus } from "../../main/plugin-system/EventBus";
import { HookRegistry } from "../../main/plugin-system/HookRegistry";
import type { PluginManifest } from "../../main/plugin-system/PluginManifest";
import type { UISlotRegistry } from "./UISlotRegistry";
import type { CommandRegistry } from "./CommandPalette";
import type { SettingsRegistry } from "./SettingsRegistry";
import type { ComponentType } from "preact";

/**
 * API surface for renderer-side plugins.
 */
export class RendererPluginContext {
  readonly pluginId: string;

  constructor(
    manifest: PluginManifest,
    private eventBus: EventBus,
    private hookRegistry: HookRegistry,
    private uiSlots: UISlotRegistry,
    private commands: CommandRegistry,
    private settings: SettingsRegistry,
    private rpcInvoke: (method: string, params?: any) => Promise<any>
  ) {
    this.pluginId = manifest.id;
  }

  // ─── Events (same as main) ─────────────────────────

  on(event: string, handler: (...args: any[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  emit(event: string, ...args: any[]): Promise<void> {
    return this.eventBus.emit(event, ...args);
  }

  // ─── Hooks (same as main) ──────────────────────────

  addHook<T>(hookName: string, handler: (value: T, ...args: any[]) => T, priority?: number): void {
    this.hookRegistry.register(hookName, handler, priority, this.pluginId);
  }

  applyHook<T>(hookName: string, initialValue: T, ...args: any[]): Promise<T> {
    return this.hookRegistry.apply(hookName, initialValue, ...args);
  }

  // ─── RPC (call main process) ───────────────────────

  /**
   * Invoke an RPC method on the main process.
   */
  rpc(method: string, params?: any): Promise<any> {
    return this.rpcInvoke(method, params);
  }

  // ─── UI Slot Injection ─────────────────────────────

  /**
   * Register a Preact component into a named UI slot.
   *
   * Slots are defined by the shell and other plugins:
   * "toolbar:left", "toolbar:right", "sidebar:top",
   * "node:before", "node:after", "node:badge",
   * "statusbar:left", "statusbar:right", etc.
   */
  registerUISlot(
    slotName: string,
    component: ComponentType<any>,
    options?: { order?: number; props?: Record<string, any> }
  ): () => void {
    return this.uiSlots.register(slotName, component, {
      pluginId: this.pluginId,
      order: options?.order ?? 100,
      props: options?.props,
    });
  }

  // ─── Commands ──────────────────────────────────────

  /**
   * Register a command that appears in the command palette
   * and can be bound to keyboard shortcuts.
   */
  registerCommand(command: {
    id: string;
    name: string;
    icon?: string;
    shortcut?: string;        // e.g. "Ctrl+Shift+P"
    execute: () => void | Promise<void>;
    isEnabled?: () => boolean; // dynamic enable/disable
  }): void {
    this.commands.register({
      ...command,
      id: `${this.pluginId}:${command.id}`,
      pluginId: this.pluginId,
    });
  }

  // ─── Settings Panel ────────────────────────────────

  /**
   * Register a settings panel for this plugin.
   * Displayed in the plugin settings view.
   */
  registerSettingsPanel(component: ComponentType<any>): void {
    this.settings.registerPanel(this.pluginId, component);
  }

  // ─── Styles ────────────────────────────────────────

  /**
   * Inject a CSS stylesheet. Returns cleanup function.
   */
  injectCSS(css: string): () => void {
    const style = document.createElement("style");
    style.setAttribute("data-plugin", this.pluginId);
    style.textContent = css;
    document.head.appendChild(style);

    return () => style.remove();
  }

  /**
   * Inject a CSS file URL. Returns cleanup function.
   */
  injectCSSFile(url: string): () => void {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.setAttribute("data-plugin", this.pluginId);
    document.head.appendChild(link);

    return () => link.remove();
  }
}
```

---

## 5. UI Slot Registry

```typescript
// src/renderer/plugin-system/UISlotRegistry.ts

import type { ComponentType } from "preact";

export interface SlotEntry {
  component: ComponentType<any>;
  pluginId: string;
  order: number;
  props?: Record<string, any>;
}

type SlotChangeListener = (slotName: string) => void;

/**
 * Named UI insertion points. The app shell and core plugins define slots,
 * and any plugin can inject components into them.
 *
 * Think of it like named <slot> elements in Web Components,
 * but dynamically managed by plugins.
 */
export class UISlotRegistry {
  private slots = new Map<string, SlotEntry[]>();
  private listeners = new Set<SlotChangeListener>();

  /**
   * Register a component into a named slot.
   * Returns an unregister function.
   */
  register(
    slotName: string,
    component: ComponentType<any>,
    options: { pluginId: string; order?: number; props?: Record<string, any> }
  ): () => void {
    if (!this.slots.has(slotName)) {
      this.slots.set(slotName, []);
    }

    const entry: SlotEntry = {
      component,
      pluginId: options.pluginId,
      order: options.order ?? 100,
      props: options.props,
    };

    const list = this.slots.get(slotName)!;
    list.push(entry);
    list.sort((a, b) => a.order - b.order);

    this.notifyChange(slotName);

    return () => {
      const idx = list.indexOf(entry);
      if (idx !== -1) {
        list.splice(idx, 1);
        this.notifyChange(slotName);
      }
    };
  }

  /**
   * Get all components for a slot, sorted by order.
   */
  getSlot(slotName: string): SlotEntry[] {
    return this.slots.get(slotName) ?? [];
  }

  /**
   * Remove all entries from a specific plugin.
   */
  removeByPlugin(pluginId: string): void {
    for (const [slotName, entries] of this.slots) {
      const filtered = entries.filter((e) => e.pluginId !== pluginId);
      this.slots.set(slotName, filtered);
      if (filtered.length !== entries.length) {
        this.notifyChange(slotName);
      }
    }
  }

  /**
   * Subscribe to slot changes (triggers re-render).
   */
  onChange(listener: SlotChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyChange(slotName: string): void {
    for (const listener of this.listeners) {
      listener(slotName);
    }
  }
}


// ─── Well-Known Slot Names ────────────────────────────

export const UISlots = {
  // Top-level layout
  TOOLBAR_LEFT: "toolbar:left",
  TOOLBAR_CENTER: "toolbar:center",
  TOOLBAR_RIGHT: "toolbar:right",

  // Main content area
  MAIN_CONTENT: "main:content",         // The primary view (tree, etc.)
  SIDEBAR_LEFT: "sidebar:left",
  SIDEBAR_RIGHT: "sidebar:right",

  // Node-level injection points
  NODE_BEFORE: "node:before",           // Before the node row
  NODE_AFTER: "node:after",             // After the node row
  NODE_BADGE: "node:badge",             // Inline badges next to content
  NODE_ACTIONS: "node:actions",         // Action buttons on hover

  // Bottom
  STATUSBAR_LEFT: "statusbar:left",
  STATUSBAR_CENTER: "statusbar:center",
  STATUSBAR_RIGHT: "statusbar:right",

  // Overlays
  MODAL: "modal",
  COMMAND_PALETTE: "command-palette",
} as const;
```

---

## 6. Dependency Resolver

```typescript
// src/main/plugin-system/DependencyResolver.ts

import type { PluginManifest } from "./PluginManifest";

export interface ResolveResult {
  /** Plugins in correct load order */
  loadOrder: string[];
  /** Plugins that couldn't be loaded due to missing deps */
  unresolvable: { pluginId: string; missingDeps: string[] }[];
  /** Circular dependency chains detected */
  circularDeps: string[][];
}

/**
 * Topological sort of plugins based on their dependency declarations.
 * Ensures plugins are loaded after their dependencies.
 */
export function resolveDependencies(
  manifests: Map<string, PluginManifest>,
  enabledPluginIds: Set<string>
): ResolveResult {
  const result: ResolveResult = {
    loadOrder: [],
    unresolvable: [],
    circularDeps: [],
  };

  // Filter to only enabled plugins
  const active = new Map<string, PluginManifest>();
  for (const [id, manifest] of manifests) {
    if (enabledPluginIds.has(id)) {
      active.set(id, manifest);
    }
  }

  // Check for missing dependencies
  for (const [id, manifest] of active) {
    const missing = (manifest.dependencies ?? []).filter(
      (depId) => !active.has(depId)
    );
    if (missing.length > 0) {
      result.unresolvable.push({ pluginId: id, missingDeps: missing });
    }
  }

  // Remove unresolvable from active set
  const unresolvableIds = new Set(result.unresolvable.map((u) => u.pluginId));
  for (const id of unresolvableIds) {
    active.delete(id);
  }

  // Kahn's algorithm for topological sort
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>(); // dependency → dependents

  for (const [id] of active) {
    inDegree.set(id, 0);
    adjList.set(id, []);
  }

  for (const [id, manifest] of active) {
    const deps = (manifest.dependencies ?? []).filter((d) => active.has(d));
    inDegree.set(id, deps.length);
    for (const dep of deps) {
      adjList.get(dep)!.push(id);
    }
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const dependent of adjList.get(current) ?? []) {
      const newDegree = inDegree.get(dependent)! - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // If sorted doesn't include all active, we have circular deps
  if (sorted.length < active.size) {
    const inCycle = new Set<string>();
    for (const [id] of active) {
      if (!sorted.includes(id)) {
        inCycle.add(id);
      }
    }
    result.circularDeps.push([...inCycle]);
  }

  result.loadOrder = sorted;
  return result;
}
```

---

## 7. Plugin Manager (Main Process)

```typescript
// src/main/plugin-system/PluginManager.ts

import { Database } from "bun:sqlite";
import type { MainPlugin, PluginManifest } from "./PluginManifest";
import { MainPluginContext, RpcHandlerRegistry, PluginSettingsStore } from "./PluginContext";
import { EventBus, CoreEvents } from "./EventBus";
import { HookRegistry } from "./HookRegistry";
import { resolveDependencies } from "./DependencyResolver";
import path from "path";

export class PluginManager {
  private manifests = new Map<string, PluginManifest>();
  private plugins = new Map<string, MainPlugin>();
  private loadedPlugins = new Set<string>();
  private enabledPlugins = new Set<string>();

  readonly eventBus = new EventBus();
  readonly hookRegistry = new HookRegistry();
  readonly rpcRegistry: RpcHandlerRegistry;
  readonly settingsStore: PluginSettingsStore;

  private db: Database;
  private appDataDir: string;

  constructor(db: Database, appDataDir: string) {
    this.db = db;
    this.appDataDir = appDataDir;
    this.rpcRegistry = new RpcHandlerRegistry();
    this.settingsStore = new PluginSettingsStore(db);

    // Create plugin system tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS _plugin_migrations (
        plugin_id  TEXT NOT NULL,
        version    INTEGER NOT NULL,
        name       TEXT NOT NULL,
        applied_at INTEGER NOT NULL,
        PRIMARY KEY (plugin_id, version)
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS _plugin_state (
        plugin_id TEXT PRIMARY KEY,
        enabled   INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Load enabled state from DB
    this.loadEnabledState();
  }

  private loadEnabledState(): void {
    const rows = this.db
      .query("SELECT plugin_id, enabled FROM _plugin_state")
      .all() as { plugin_id: string; enabled: number }[];

    for (const row of rows) {
      if (row.enabled) {
        this.enabledPlugins.add(row.plugin_id);
      }
    }
  }

  // ─── Registration ───────────────────────────────────

  /**
   * Register a plugin (built-in or discovered).
   * Does NOT load it yet.
   */
  register(plugin: MainPlugin): void {
    const { manifest } = plugin;
    this.manifests.set(manifest.id, manifest);
    this.plugins.set(manifest.id, plugin);

    // If no state stored yet, use the default
    const stored = this.db
      .query("SELECT enabled FROM _plugin_state WHERE plugin_id = ?")
      .get(manifest.id) as { enabled: number } | null;

    if (!stored) {
      const enabled = manifest.essential || (manifest.enabledByDefault !== false);
      this.db.run(
        "INSERT INTO _plugin_state (plugin_id, enabled) VALUES (?, ?)",
        [manifest.id, enabled ? 1 : 0]
      );
      if (enabled) {
        this.enabledPlugins.add(manifest.id);
      }
    }
  }

  // ─── Discovery ──────────────────────────────────────

  /**
   * Discover and register third-party plugins from the plugins directory.
   */
  async discoverCommunityPlugins(pluginsDir: string): Promise<void> {
    const fs = await import("fs");

    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
      return;
    }

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = path.join(pluginsDir, entry.name);
      const manifestPath = path.join(pluginPath, "manifest.ts");
      const indexPath = path.join(pluginPath, "index.ts");

      if (!fs.existsSync(indexPath)) continue;

      try {
        const pluginModule = await import(indexPath);

        if (pluginModule.default && pluginModule.default.manifest) {
          const plugin = pluginModule.default as MainPlugin;
          plugin.manifest.type = "community"; // enforce
          this.register(plugin);
        }
      } catch (err) {
        console.error(`Failed to load community plugin from ${pluginPath}:`, err);
      }
    }
  }

  // ─── Lifecycle ──────────────────────────────────────

  /**
   * Load all enabled plugins in dependency order.
   */
  async loadAll(): Promise<void> {
    const resolution = resolveDependencies(this.manifests, this.enabledPlugins);

    // Log warnings
    for (const unresolvable of resolution.unresolvable) {
      console.warn(
        `Plugin "${unresolvable.pluginId}" skipped: missing dependencies [${unresolvable.missingDeps.join(", ")}]`
      );
    }

    for (const cycle of resolution.circularDeps) {
      console.error(`Circular dependency detected: ${cycle.join(" → ")}`);
    }

    // Load in resolved order
    for (const pluginId of resolution.loadOrder) {
      await this.loadPlugin(pluginId);
    }

    await this.eventBus.emit(CoreEvents.APP_READY);
  }

  /**
   * Load a single plugin.
   */
  private async loadPlugin(pluginId: string): Promise<void> {
    if (this.loadedPlugins.has(pluginId)) return;

    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    const context = new MainPluginContext(
      plugin.manifest,
      this.db,
      this.eventBus,
      this.hookRegistry,
      this.rpcRegistry,
      this.settingsStore,
      this.appDataDir
    );

    try {
      await plugin.onLoad(context);
      this.loadedPlugins.add(pluginId);
      console.log(`✓ Loaded plugin: ${plugin.manifest.name} (${pluginId})`);
      await this.eventBus.emit(CoreEvents.PLUGIN_LOADED, pluginId);
    } catch (err) {
      console.error(`✗ Failed to load plugin "${pluginId}":`, err);
    }
  }

  /**
   * Enable a plugin at runtime.
   */
  async enablePlugin(pluginId: string): Promise<boolean> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return false;

    // Check dependencies are enabled
    for (const depId of manifest.dependencies ?? []) {
      if (!this.loadedPlugins.has(depId)) {
        console.error(`Cannot enable "${pluginId}": dependency "${depId}" is not loaded`);
        return false;
      }
    }

    this.enabledPlugins.add(pluginId);
    this.db.run("UPDATE _plugin_state SET enabled = 1 WHERE plugin_id = ?", [pluginId]);

    await this.loadPlugin(pluginId);
    return true;
  }

  /**
   * Disable a plugin at runtime.
   */
  async disablePlugin(pluginId: string): Promise<boolean> {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return false;

    if (manifest.essential) {
      console.warn(`Cannot disable essential plugin "${pluginId}"`);
      return false;
    }

    // Check if any loaded plugin depends on this one
    for (const [id, m] of this.manifests) {
      if (this.loadedPlugins.has(id) && m.dependencies?.includes(pluginId)) {
        console.error(`Cannot disable "${pluginId}": plugin "${id}" depends on it`);
        return false;
      }
    }

    // Unload
    const plugin = this.plugins.get(pluginId);
    if (plugin && this.loadedPlugins.has(pluginId)) {
      try {
        await plugin.onUnload();
      } catch (err) {
        console.error(`Error unloading plugin "${pluginId}":`, err);
      }

      // Clean up all registrations
      this.rpcRegistry.removeByPlugin(pluginId);
      this.hookRegistry.removeByPlugin(pluginId);
      this.loadedPlugins.delete(pluginId);
    }

    this.enabledPlugins.delete(pluginId);
    this.db.run("UPDATE _plugin_state SET enabled = 0 WHERE plugin_id = ?", [pluginId]);

    await this.eventBus.emit(CoreEvents.PLUGIN_UNLOADED, pluginId);
    return true;
  }

  /**
   * Get manifest + state for all registered plugins (for settings UI).
   */
  getPluginList(): Array<PluginManifest & { enabled: boolean; loaded: boolean }> {
    const list: Array<PluginManifest & { enabled: boolean; loaded: boolean }> = [];

    for (const [id, manifest] of this.manifests) {
      list.push({
        ...manifest,
        enabled: this.enabledPlugins.has(id),
        loaded: this.loadedPlugins.has(id),
      });
    }

    return list.sort((a, b) => {
      // Core first, then alphabetical
      if (a.type !== b.type) return a.type === "core" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async shutdown(): Promise<void> {
    await this.eventBus.emit(CoreEvents.APP_WILL_QUIT);

    // Unload in reverse order
    const loadOrder = [...this.loadedPlugins];
    for (const pluginId of loadOrder.reverse()) {
      const plugin = this.plugins.get(pluginId);
      if (plugin) {
        try {
          await plugin.onUnload();
        } catch (err) {
          console.error(`Error unloading "${pluginId}":`, err);
        }
      }
    }

    this.loadedPlugins.clear();
  }
}
```

---

## 8. Example Built-In Plugins

### 8.1 `core-node-ops` — The Essential Data Layer

```typescript
// src/main/plugins/core-node-ops/manifest.ts
import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-node-ops",
  name: "Core: Node Operations",
  version: "1.0.0",
  description: "Provides the outline node data model, CRUD operations, and tree queries. This is the foundation all other plugins build on.",
  author: "Outliner Team",
  type: "core",
  runtime: "main",
  essential: true,           // Cannot be disabled
  enabledByDefault: true,
  dependencies: [],          // No dependencies — this IS the foundation
};
```

```typescript
// src/main/plugins/core-node-ops/index.ts
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import { NodeRepository } from "./repository";
import { NodeService } from "./service";
import { CoreEvents } from "../../plugin-system/EventBus";
import { CoreHooks } from "../../plugin-system/HookRegistry";

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    // ─── Run migrations ─────────────────────────────
    ctx.runMigration(1, "create_outline_nodes", `
      CREATE TABLE IF NOT EXISTS outline_nodes (
        id          TEXT PRIMARY KEY,
        content     TEXT NOT NULL DEFAULT '',
        parent_id   TEXT,
        position    INTEGER NOT NULL DEFAULT 0,
        is_expanded INTEGER NOT NULL DEFAULT 1,
        is_deleted  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES outline_nodes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON outline_nodes(parent_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_parent_position ON outline_nodes(parent_id, position);
      CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON outline_nodes(is_deleted)
    `);

    // ─── Initialize repository & service ────────────
    const db = ctx.getDatabase();
    const repo = new NodeRepository(db);
    const service = new NodeService(repo, ctx);

    // ─── Register RPC handlers (no prefix for core) ─
    ctx.registerRpcHandler("getFullTree", () => service.getFullTree(), { noPrefix: true });
    ctx.registerRpcHandler("getSubtree", (p) => service.getSubtree(p), { noPrefix: true });
    ctx.registerRpcHandler("getNode", (p) => service.getNode(p.id), { noPrefix: true });
    ctx.registerRpcHandler("getAncestors", (p) => service.getAncestors(p.nodeId), { noPrefix: true });
    ctx.registerRpcHandler("getStats", () => service.getStats(), { noPrefix: true });

    ctx.registerRpcHandler("createNode", async (params) => {
      // Apply hooks before creation
      const processed = await ctx.applyHook(CoreHooks.NODE_BEFORE_CREATE, params);
      const result = service.createNode(processed);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_CREATED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("updateNode", async (params) => {
      const result = service.updateNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_UPDATED, result.data, params);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("moveNode", async (params) => {
      const result = service.moveNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_MOVED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("indentNode", async (params) => {
      const result = service.indentNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_INDENTED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("outdentNode", async (params) => {
      const result = service.outdentNode(params);
      if (result.success && result.data) {
        await ctx.emit(CoreEvents.NODE_OUTDENTED, result.data);
      }
      return result;
    }, { noPrefix: true });

    ctx.registerRpcHandler("deleteNode", async (params) => {
      const processed = await ctx.applyHook(CoreHooks.NODE_BEFORE_DELETE, params);
      if (processed === null) return { success: false, error: "Deletion cancelled by hook" };
      const result = service.deleteNode(processed);
      if (result.success) {
        await ctx.emit(CoreEvents.NODE_DELETED, params.id);
      }
      return result;
    }, { noPrefix: true });

    // ─── Seed data if empty ─────────────────────────
    if (repo.getNodeCount() === 0) {
      service.seedInitialData();
    }

    ctx.log("Node operations ready");
  },

  async onUnload() {
    // Essential plugin — this should never actually be called
  },
};

export default plugin;
```

### 8.2 `core-fts-search` — Full-Text Search

```typescript
// src/main/plugins/core-fts-search/manifest.ts
import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-fts-search",
  name: "Core: Full-Text Search",
  version: "1.0.0",
  description: "Adds FTS5-powered full-text search across all nodes. Disable if you don't need search to save memory.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: false,           // CAN be disabled!
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
```

```typescript
// src/main/plugins/core-fts-search/index.ts
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    ctx.runMigration(1, "create_fts_tables", `
      CREATE VIRTUAL TABLE IF NOT EXISTS outline_nodes_fts USING fts5(
        content,
        content='outline_nodes',
        content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS outline_nodes_fts_ai AFTER INSERT ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;
      CREATE TRIGGER IF NOT EXISTS outline_nodes_fts_ad AFTER DELETE ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(outline_nodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END;
      CREATE TRIGGER IF NOT EXISTS outline_nodes_fts_au AFTER UPDATE OF content ON outline_nodes BEGIN
        INSERT INTO outline_nodes_fts(outline_nodes_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO outline_nodes_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END
    `);

    const db = ctx.getDatabase();

    ctx.registerRpcHandler("search", (params: { query: string; limit?: number }) => {
      try {
        const ftsQuery = params.query
          .split(/\s+/)
          .map((term) => `"${term}"*`)
          .join(" AND ");

        const results = db.query(`
          SELECT n.* FROM outline_nodes n
          JOIN outline_nodes_fts fts ON n.rowid = fts.rowid
          WHERE outline_nodes_fts MATCH ? AND n.is_deleted = 0
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, params.limit ?? 50);

        return { success: true, data: results };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }, { noPrefix: true });

    ctx.log("Full-text search ready");
  },

  async onUnload() {
    // RPC handler auto-cleaned by PluginManager
    // FTS tables remain (data preservation) but won't be used
  },
};

export default plugin;
```

### 8.3 `core-tree-view` — The Outliner UI (Renderer Plugin)

```typescript
// src/renderer/plugins/core-tree-view/manifest.ts
import type { PluginManifest } from "../../../main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-tree-view",
  name: "Core: Tree View",
  version: "1.0.0",
  description: "The main outliner tree view. Renders the hierarchical list of nodes.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: true,
  enabledByDefault: true,
  dependencies: ["core-node-ops", "core-editor"],
};
```

```typescript
// src/renderer/plugins/core-tree-view/index.ts
import type { RendererPlugin } from "../../../main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { UISlots } from "../../plugin-system/UISlotRegistry";
import { manifest } from "./manifest";
import { OutlineTree } from "./OutlineTree";
import { treeViewCSS } from "./styles";

let cleanupCSS: (() => void) | null = null;
let cleanupSlot: (() => void) | null = null;

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    // Inject styles
    cleanupCSS = ctx.injectCSS(treeViewCSS);

    // Register the tree view into the main content slot
    cleanupSlot = ctx.registerUISlot(UISlots.MAIN_CONTENT, OutlineTree, {
      order: 0, // Primary content
    });

    // Register commands
    ctx.registerCommand({
      id: "collapse-all",
      name: "Collapse All Nodes",
      shortcut: "Ctrl+Shift+Up",
      execute: () => ctx.emit("tree:collapseAll"),
    });

    ctx.registerCommand({
      id: "expand-all",
      name: "Expand All Nodes",
      shortcut: "Ctrl+Shift+Down",
      execute: () => ctx.emit("tree:expandAll"),
    });
  },

  async onUnload() {
    cleanupCSS?.();
    cleanupSlot?.();
  },
};

export default plugin;
```

### 8.4 `core-keyboard` — Keyboard Shortcuts

```typescript
// src/renderer/plugins/core-keyboard/manifest.ts
import type { PluginManifest } from "../../../main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-keyboard",
  name: "Core: Keyboard Shortcuts",
  version: "1.0.0",
  description: "Provides standard keyboard shortcuts for outliner operations (Enter, Tab, Shift+Tab, arrow keys, etc). Disable to use a custom keybinding plugin instead.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,        // Can be disabled for custom keybinding plugins!
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
```

```typescript
// src/renderer/plugins/core-keyboard/index.ts
import type { RendererPlugin } from "../../../main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { CoreEvents } from "../../../main/plugin-system/EventBus";

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
            ctx.emit("action:createNodeAfter", nodeId);
          }
          break;

        case "Tab":
          e.preventDefault();
          if (e.shiftKey) {
            ctx.emit("action:outdentNode", nodeId);
          } else {
            ctx.emit("action:indentNode", nodeId);
          }
          break;

        case "Backspace":
          if (target.textContent === "") {
            e.preventDefault();
            ctx.emit("action:deleteNode", nodeId);
          }
          break;

        case "ArrowUp":
          if (e.altKey && e.shiftKey) {
            e.preventDefault();
            ctx.emit("action:moveNodeUp", nodeId);
          } else if (e.altKey) {
            e.preventDefault();
            ctx.emit("action:focusPrevious", nodeId);
          }
          break;

        case "ArrowDown":
          if (e.altKey && e.shiftKey) {
            e.preventDefault();
            ctx.emit("action:moveNodeDown", nodeId);
          } else if (e.altKey) {
            e.preventDefault();
            ctx.emit("action:focusNext", nodeId);
          }
          break;

        case "Escape":
          e.preventDefault();
          target.blur();
          break;
      }
    };

    document.addEventListener("keydown", keydownHandler, true);

    // Also register global shortcuts
    ctx.registerCommand({
      id: "new-root-node",
      name: "Create New Root Node",
      shortcut: "Ctrl+Enter",
      execute: () => ctx.emit("action:createRootNode"),
    });

    ctx.registerCommand({
      id: "search-focus",
      name: "Search",
      shortcut: "Ctrl+F",
      execute: () => ctx.emit(CoreEvents.SEARCH_OPENED),
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
```

### 8.5 `core-drag-drop` — Drag and Drop Reordering

```typescript
// src/renderer/plugins/core-drag-drop/manifest.ts
import type { PluginManifest } from "../../../main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-drag-drop",
  name: "Core: Drag & Drop",
  version: "1.0.0",
  description: "Enables drag-and-drop reordering and reparenting of nodes. Disable for a lighter, keyboard-only experience.",
  author: "Outliner Team",
  type: "core",
  runtime: "renderer",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops", "core-tree-view"],
};
```

```typescript
// src/renderer/plugins/core-drag-drop/index.ts
import type { RendererPlugin } from "../../../main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { CoreHooks } from "../../../main/plugin-system/HookRegistry";

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    // Add CSS classes to make nodes draggable
    ctx.addHook(CoreHooks.NODE_CSS_CLASSES, (classes: string[], nodeId: string) => {
      return [...classes, "draggable-node"];
    }, 100);

    // Inject drag-drop CSS
    ctx.injectCSS(`
      .draggable-node { cursor: grab; }
      .draggable-node:active { cursor: grabbing; opacity: 0.6; }
      .drag-over-top { border-top: 2px solid var(--accent); }
      .drag-over-bottom { border-bottom: 2px solid var(--accent); }
      .drag-over-child { background: var(--focus-bg); }
    `);

    // Delegate drag events on the tree container
    const treeEl = document.querySelector(".outline-tree");
    if (!treeEl) return;

    let draggedNodeId: string | null = null;

    const onDragStart = (e: DragEvent) => {
      const nodeEl = (e.target as HTMLElement).closest("[data-node-id]");
      if (!nodeEl) return;
      draggedNodeId = (nodeEl as HTMLElement).dataset.nodeId!;
      e.dataTransfer!.effectAllowed = "move";
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      // Visual indicator logic...
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const targetEl = (e.target as HTMLElement).closest("[data-node-id]");
      if (!targetEl || !draggedNodeId) return;

      const targetId = (targetEl as HTMLElement).dataset.nodeId!;
      if (draggedNodeId === targetId) return;

      ctx.emit("action:moveNodeTo", draggedNodeId, targetId);
      draggedNodeId = null;
    };

    treeEl.addEventListener("dragstart", onDragStart as EventListener);
    treeEl.addEventListener("dragover", onDragOver as EventListener);
    treeEl.addEventListener("drop", onDrop as EventListener);
  },

  async onUnload() {
    // Event listeners and CSS auto-cleaned
  },
};

export default plugin;
```

### 8.6 `core-undo-redo` — Undo/Redo System

```typescript
// src/main/plugins/core-undo-redo/manifest.ts
import type { PluginManifest } from "../../plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "core-undo-redo",
  name: "Core: Undo/Redo",
  version: "1.0.0",
  description: "Provides undo/redo for all node operations. Disable if not needed to reduce memory usage.",
  author: "Outliner Team",
  type: "core",
  runtime: "both",
  essential: false,
  enabledByDefault: true,
  dependencies: ["core-node-ops"],
};
```

```typescript
// src/main/plugins/core-undo-redo/index.ts
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";
import { CoreEvents } from "../../plugin-system/EventBus";

interface UndoEntry {
  type: string;
  timestamp: number;
  data: any;        // Snapshot before the operation
  reverseData: any; // Data needed to undo
}

const MAX_UNDO_STACK = 100;

const plugin: MainPlugin = {
  manifest,

  async onLoad(ctx: MainPluginContext) {
    const db = ctx.getDatabase();
    const undoStack: UndoEntry[] = [];
    const redoStack: UndoEntry[] = [];

    // Listen to all node mutations and record undo entries
    ctx.on(CoreEvents.NODE_CREATED, (node) => {
      undoStack.push({
        type: "create",
        timestamp: Date.now(),
        data: node,
        reverseData: { id: node.id },
      });
      redoStack.length = 0; // Clear redo on new action
      if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    });

    ctx.on(CoreEvents.NODE_UPDATED, (node, changes) => {
      // Snapshot previous values from DB before the change was applied
      undoStack.push({
        type: "update",
        timestamp: Date.now(),
        data: { id: node.id, ...changes },
        reverseData: { id: node.id, previousContent: node.content },
      });
      redoStack.length = 0;
      if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    });

    ctx.on(CoreEvents.NODE_DELETED, (nodeId) => {
      // For undo of delete, we'd need to store the full subtree snapshot
      // Simplified: just store the node ID for soft-delete reversal
      undoStack.push({
        type: "delete",
        timestamp: Date.now(),
        data: { nodeId },
        reverseData: { nodeId },
      });
      redoStack.length = 0;
      if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    });

    // RPC handlers
    ctx.registerRpcHandler("undo", () => {
      if (undoStack.length === 0) return { success: false, error: "Nothing to undo" };

      const entry = undoStack.pop()!;
      redoStack.push(entry);

      // Execute reverse operation based on type
      switch (entry.type) {
        case "create":
          // Undo create = soft delete
          db.run("UPDATE outline_nodes SET is_deleted = 1 WHERE id = ?", [entry.reverseData.id]);
          break;
        case "update":
          // Undo update = restore previous content
          db.run("UPDATE outline_nodes SET content = ?, updated_at = ? WHERE id = ?", [
            entry.reverseData.previousContent,
            Date.now(),
            entry.reverseData.id,
          ]);
          break;
        case "delete":
          // Undo delete = restore (un-soft-delete)
          db.run("UPDATE outline_nodes SET is_deleted = 0 WHERE id = ?", [entry.reverseData.nodeId]);
          break;
      }

      return { success: true, data: { type: entry.type } };
    }, { noPrefix: true });

    ctx.registerRpcHandler("redo", () => {
      if (redoStack.length === 0) return { success: false, error: "Nothing to redo" };

      const entry = redoStack.pop()!;
      undoStack.push(entry);

      // Re-execute the original operation
      switch (entry.type) {
        case "create":
          db.run("UPDATE outline_nodes SET is_deleted = 0 WHERE id = ?", [entry.data.id]);
          break;
        case "update":
          db.run("UPDATE outline_nodes SET content = ?, updated_at = ? WHERE id = ?", [
            entry.data.content ?? entry.data.previousContent,
            Date.now(),
            entry.data.id,
          ]);
          break;
        case "delete":
          db.run("UPDATE outline_nodes SET is_deleted = 1 WHERE id = ?", [entry.data.nodeId]);
          break;
      }

      return { success: true, data: { type: entry.type } };
    }, { noPrefix: true });

    ctx.registerRpcHandler("getUndoRedoState", () => {
      return {
        success: true,
        data: {
          canUndo: undoStack.length > 0,
          canRedo: redoStack.length > 0,
          undoCount: undoStack.length,
          redoCount: redoStack.length,
        },
      };
    }, { noPrefix: true });

    ctx.log(`Undo/Redo ready (max ${MAX_UNDO_STACK} entries)`);
  },

  async onUnload() {
    // Stacks are garbage collected
  },
};

export default plugin;
```

---

## 9. App Shell (Minimal Bootstrap)

### 9.1 Main Process Shell

```typescript
// src/main/index.ts
import { Electrobun, BrowserWindow } from "electrobun/bun";
import { getDatabase, closeDatabase } from "./database/connection";
import { PluginManager } from "./plugin-system/PluginManager";
import path from "path";

// ─── Minimal Database Setup (only plugin system tables) ──
const db = getDatabase();

// ─── Initialize Plugin Manager ──────────────────────────
const appDataDir = process.env.ELECTROBUN_APP_DATA || "./data";
const pluginManager = new PluginManager(db, appDataDir);

// ─── Register Built-in Plugins (Skeleton-Aware) ─────────
// Only plugins in the current skeleton are loaded; others are tree-shaken or skipped
const { loadMainPlugins } = await import("./skeletons/loadPlugins");
for (const plugin of await loadMainPlugins()) {
  pluginManager.register(plugin);
}

// ─── Discover Community Plugins ─────────────────────────
const communityPluginsDir = path.join(appDataDir, "plugins");
await pluginManager.discoverCommunityPlugins(communityPluginsDir);

// ─── Load All Enabled Plugins ───────────────────────────
await pluginManager.loadAll();

// ─── Create Window ──────────────────────────────────────
const mainWindow = new BrowserWindow({
  title: "Outliner",
  width: 900,
  height: 700,
  url: "electrobun://renderer/index.html",
});

// ─── Bridge RPC: route all renderer calls to plugin handlers ─
const rpc = mainWindow.browserView.rpc;

// Generic RPC router — dispatches to whatever plugin registered the handler
rpc.handle("__rpc__", async (payload: { method: string; params?: any }) => {
  const handler = pluginManager.rpcRegistry.get(payload.method);
  if (!handler) {
    return { success: false, error: `No handler for "${payload.method}"` };
  }
  return handler(payload.params);
});

// Plugin management RPC (always available)
rpc.handle("__plugins__", async (payload: { action: string; pluginId?: string; skeleton?: string }) => {
  switch (payload.action) {
    case "list":
      return { success: true, data: pluginManager.getPluginList() };
    case "enable":
      return { success: await pluginManager.enablePlugin(payload.pluginId!) };
    case "disable":
      return { success: await pluginManager.disablePlugin(payload.pluginId!) };
    case "applySkeleton": {
      // Batch enable plugins in skeleton, disable others (runtime profile switching)
      const { getPluginsForSkeleton } = await import("../../skeletons.config");
      const ids = new Set(getPluginsForSkeleton(payload.skeleton as any));
      const list = pluginManager.getPluginList();
      // Disable first (all non-essential not in skeleton)
      for (const p of list) {
        if (p.essential || ids.has(p.id)) continue;
        await pluginManager.disablePlugin(p.id);
      }
      // Enable in skeleton (multi-pass until stable; respects dependency order)
      let changed = true;
      while (changed) {
        changed = false;
        for (const p of list) {
          if (!ids.has(p.id) || p.enabled) continue;
          if (await pluginManager.enablePlugin(p.id)) changed = true;
        }
      }
      return { success: true };
    }
    default:
      return { success: false, error: "Unknown plugin action" };
  }
});

// Send enabled plugin list to renderer for its own plugin loading
rpc.handle("__getEnabledRendererPlugins__", async () => {
  const plugins = pluginManager.getPluginList();
  return {
    success: true,
    data: plugins
      .filter((p) => p.enabled && (p.runtime === "renderer" || p.runtime === "both"))
      .map((p) => p.id),
  };
});

// ─── Lifecycle ──────────────────────────────────────────
Electrobun.events.on("will-quit", async () => {
  await pluginManager.shutdown();
  closeDatabase();
});

mainWindow.on("close", () => Electrobun.quit());
```

### 9.2 Renderer Shell

```typescript
// src/renderer/index.ts
import { render } from "preact";
import { html } from "htm/preact";
import { rpc } from "electrobun/browser";
import { RendererPluginManager } from "./plugin-system/RendererPluginManager";
import { AppShell } from "./shell/AppShell";

// ─── Initialize Renderer Plugin Manager ─────────────────
const pluginManager = new RendererPluginManager(rpc);

// ─── Register Built-in Renderer Plugins (Skeleton-Aware) ─
const { loadRendererPlugins } = await import("./skeletons/loadPlugins");
for (const plugin of await loadRendererPlugins()) {
  pluginManager.register(plugin);
}

// ─── Load Enabled Plugins ───────────────────────────────
await pluginManager.loadFromMainProcess();

// ─── Render App Shell ───────────────────────────────────
render(
  html`<${AppShell} pluginManager=${pluginManager} />`,
  document.getElementById("app")!
);
```

### 9.3 App Shell Component (Slot-Based)

```typescript
// src/renderer/shell/AppShell.ts
import { useState, useEffect, useCallback } from "preact/hooks";
import { html } from "htm/preact";
import type { RendererPluginManager } from "../plugin-system/RendererPluginManager";
import { UISlots, type SlotEntry } from "../plugin-system/UISlotRegistry";

interface Props {
  pluginManager: RendererPluginManager;
}

/**
 * The App Shell renders named UI slots.
 * All actual UI content is injected by plugins.
 * The shell itself is just a layout frame.
 */
export function AppShell({ pluginManager }: Props) {
  const [, forceUpdate] = useState(0);
  const slots = pluginManager.uiSlots;

  // Re-render when any slot changes
  useEffect(() => {
    return slots.onChange(() => forceUpdate((n) => n + 1));
  }, [slots]);

  const renderSlot = useCallback(
    (slotName: string) => {
      const entries = slots.getSlot(slotName);
      return entries.map(
        (entry: SlotEntry) =>
          html`<${entry.component}
            key=${entry.pluginId}
            pluginManager=${pluginManager}
            ...${entry.props || {}}
          />`
      );
    },
    [slots, pluginManager]
  );

  return html`
    <div class="app-shell">
      <!-- Toolbar area -->
      <header class="shell-toolbar">
        <div class="slot-toolbar-left">${renderSlot(UISlots.TOOLBAR_LEFT)}</div>
        <div class="slot-toolbar-center">${renderSlot(UISlots.TOOLBAR_CENTER)}</div>
        <div class="slot-toolbar-right">${renderSlot(UISlots.TOOLBAR_RIGHT)}</div>
      </header>

      <!-- Main area -->
      <div class="shell-body">
        <aside class="slot-sidebar-left">${renderSlot(UISlots.SIDEBAR_LEFT)}</aside>
        <main class="slot-main-content">${renderSlot(UISlots.MAIN_CONTENT)}</main>
        <aside class="slot-sidebar-right">${renderSlot(UISlots.SIDEBAR_RIGHT)}</aside>
      </div>

      <!-- Status bar -->
      <footer class="shell-statusbar">
        <div class="slot-statusbar-left">${renderSlot(UISlots.STATUSBAR_LEFT)}</div>
        <div class="slot-statusbar-center">${renderSlot(UISlots.STATUSBAR_CENTER)}</div>
        <div class="slot-statusbar-right">${renderSlot(UISlots.STATUSBAR_RIGHT)}</div>
      </footer>

      <!-- Overlays -->
      <div class="slot-modals">${renderSlot(UISlots.MODAL)}</div>
      <div class="slot-command-palette">${renderSlot(UISlots.COMMAND_PALETTE)}</div>
    </div>
  `;
}
```

---

## 10. Plugin Settings UI

```typescript
// src/renderer/shell/PluginSettingsView.ts
import { useState, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { rpc } from "electrobun/browser";
import type { PluginManifest } from "../../main/plugin-system/PluginManifest";

interface PluginInfo extends PluginManifest {
  enabled: boolean;
  loaded: boolean;
}

export function PluginSettingsView() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [filter, setFilter] = useState<"all" | "core" | "community">("all");

  const loadPlugins = async () => {
    const result = await rpc.invoke("__plugins__", { action: "list" });
    if (result.success) setPlugins(result.data);
  };

  useEffect(() => { loadPlugins(); }, []);

  const togglePlugin = async (pluginId: string, currentlyEnabled: boolean) => {
    const action = currentlyEnabled ? "disable" : "enable";
    const result = await rpc.invoke("__plugins__", { action, pluginId });

    if (result.success) {
      loadPlugins(); // Refresh
    } else {
      alert(`Failed to ${action} plugin. It may have dependents.`);
    }
  };

  const filtered = plugins.filter((p) => filter === "all" || p.type === filter);

  const corePlugins = filtered.filter((p) => p.type === "core");
  const communityPlugins = filtered.filter((p) => p.type === "community");

  const renderPlugin = (plugin: PluginInfo) => html`
    <div class="plugin-card ${plugin.enabled ? "enabled" : "disabled"}">
      <div class="plugin-header">
        <div class="plugin-info">
          <span class="plugin-name">${plugin.name}</span>
          <span class="plugin-version">v${plugin.version}</span>
          ${plugin.essential && html`<span class="plugin-badge essential">Essential</span>`}
          <span class="plugin-badge ${plugin.type}">${plugin.type}</span>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            checked=${plugin.enabled}
            disabled=${plugin.essential}
            onChange=${() => togglePlugin(plugin.id, plugin.enabled)}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="plugin-description">${plugin.description}</p>
      <div class="plugin-meta">
        <span>by ${plugin.author}</span>
        ${plugin.dependencies?.length > 0 && html`
          <span>Requires: ${plugin.dependencies.join(", ")}</span>
        `}
      </div>
    </div>
  `;

  const applySkeleton = async (skeleton: string) => {
    const result = await rpc.invoke("__plugins__", { action: "applySkeleton", skeleton });
    if (result.success) {
      loadPlugins();
      window.location.reload(); // Reload to re-init renderer plugins
    }
  };

  return html`
    <div class="plugin-settings">
      <h2>Plugins</h2>
      <p class="subtitle">Enable or disable features. Use a profile to quickly switch between minimal, standard, or full.</p>

      <div class="skeleton-selector">
        <label>Profile:</label>
        <select onChange=${(e: Event) => applySkeleton((e.target as HTMLSelectElement).value)}>
          <option value="minimal">Minimal (tree + edit only)</option>
          <option value="standard">Standard (daily use)</option>
          <option value="full">Full (all features)</option>
        </select>
      </div>

      <div class="filter-tabs">
        <button class=${filter === "all" ? "active" : ""} onClick=${() => setFilter("all")}>
          All (${plugins.length})
        </button>
        <button class=${filter === "core" ? "active" : ""} onClick=${() => setFilter("core")}>
          Core (${plugins.filter((p) => p.type === "core").length})
        </button>
        <button class=${filter === "community" ? "active" : ""} onClick=${() => setFilter("community")}>
          Community (${plugins.filter((p) => p.type === "community").length})
        </button>
      </div>

      ${corePlugins.length > 0 && html`
        <h3>Core Plugins</h3>
        <div class="plugin-list">
          ${corePlugins.map(renderPlugin)}
        </div>
      `}

      ${communityPlugins.length > 0 && html`
        <h3>Community Plugins</h3>
        <div class="plugin-list">
          ${communityPlugins.map(renderPlugin)}
        </div>
      `}
    </div>
  `;
}
```

---

## 11. Complete Built-In Plugin Registry

| Plugin ID | Name | Runtime | Essential | Default | Dependencies | What It Does |
|---|---|---|---|---|---|---|
| `core-node-ops` | Node Operations | main | ✅ | ✅ | — | SQLite schema, CRUD, tree queries |
| `core-fts-search` | Full-Text Search | both | ❌ | ✅ | `core-node-ops` | FTS5 search index + search UI |
| `core-undo-redo` | Undo/Redo | both | ❌ | ✅ | `core-node-ops` | Operation history stack |
| `core-settings` | Settings | both | ✅ | ✅ | — | Plugin enable/disable UI, app prefs |
| `core-tree-view` | Tree View | renderer | ✅ | ✅ | `core-node-ops`, `core-editor` | Main outline tree renderer |
| `core-editor` | Node Editor | renderer | ✅ | ✅ | `core-node-ops` | Inline contenteditable editor |
| `core-keyboard` | Keyboard Shortcuts | renderer | ❌ | ✅ | `core-node-ops` | Enter, Tab, arrow key bindings |
| `core-search` | Search UI | renderer | ❌ | ✅ | `core-fts-search` | Search bar + results panel |
| `core-breadcrumb` | Breadcrumb | renderer | ❌ | ✅ | `core-zoom` | Navigation breadcrumb trail |
| `core-zoom` | Zoom | renderer | ❌ | ✅ | `core-node-ops` | Zoom into/out of nodes |
| `core-drag-drop` | Drag & Drop | renderer | ❌ | ✅ | `core-node-ops`, `core-tree-view` | Drag reordering of nodes |
| `core-toolbar` | Toolbar | renderer | ❌ | ✅ | — | Top toolbar UI frame |
| `core-theme` | Default Theme | renderer | ❌ | ✅ | — | Base CSS styles and dark mode |
| `core-context-menu` | Context Menu | renderer | ❌ | ✅ | `core-node-ops` | Right-click node menu |

---

## 12. Example Third-Party Plugin

```typescript
// plugins/plugin-word-count/manifest.ts
import type { PluginManifest } from "../../src/main/plugin-system/PluginManifest";

export const manifest: PluginManifest = {
  id: "community-word-count",
  name: "Word Count",
  version: "1.0.0",
  description: "Shows a live word count in the status bar.",
  author: "Community Author",
  type: "community",
  runtime: "renderer",
  enabledByDefault: false,
  dependencies: ["core-node-ops"],
};
```

```typescript
// plugins/plugin-word-count/index.ts
import type { RendererPlugin } from "../../src/main/plugin-system/PluginManifest";
import type { RendererPluginContext } from "../../src/renderer/plugin-system/RendererPluginContext";
import { UISlots } from "../../src/renderer/plugin-system/UISlotRegistry";
import { CoreEvents } from "../../src/main/plugin-system/EventBus";
import { manifest } from "./manifest";
import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";

function WordCountWidget({ pluginManager }: any) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = async () => {
      const result = await pluginManager.rpc("getStats");
      if (result.success) setCount(result.data.nodeCount);
    };

    update();

    const unsub = pluginManager.eventBus.on(CoreEvents.NODE_CREATED, update);
    const unsub2 = pluginManager.eventBus.on(CoreEvents.NODE_DELETED, update);
    return () => { unsub(); unsub2(); };
  }, []);

  return html`<span class="word-count">${count} nodes</span>`;
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctx.registerUISlot(UISlots.STATUSBAR_RIGHT, WordCountWidget, { order: 200 });

    ctx.injectCSS(`
      .word-count {
        font-size: 12px;
        color: var(--text-muted);
        padding: 0 8px;
      }
    `);
  },

  async onUnload() {
    // Slot and CSS auto-cleaned
  },
};

export default plugin;
```

---

## 13. Plugin Interaction Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                    Plugin Communication Flow                       │
│                                                                    │
│  core-keyboard ──(event: action:indentNode)──► core-tree-view     │
│       │                                              │             │
│       │                                              ▼             │
│       │                                        store.indentNode()  │
│       │                                              │             │
│       │                                              ▼             │
│       │                                     rpc("indentNode")      │
│       │                                              │             │
│  ═════╪══════════════════════════════════════════════╪═════════    │
│  MAIN │                                              ▼             │
│       │                                   core-node-ops handler    │
│       │                                              │             │
│       │                                      ┌───────┴────────┐   │
│       │                                      ▼                ▼   │
│       │                              SQLite update    emit event   │
│       │                                               NODE_INDENTED│
│       │                                                    │       │
│       │              ┌─────────────────────────────────────┤       │
│       │              ▼                                     ▼       │
│       │      core-undo-redo                        (any listener)  │
│       │      (records undo entry)                                  │
│       │                                                            │
│  ═════╪════════════════════════════════════════════════════════    │
│  RENDERER                                                          │
│       │                                                            │
│       │         tree reloaded via getFullTree RPC                  │
│       │              │                                             │
│       │              ▼                                             │
│       │   ┌──── hook: TREE_BEFORE_RENDER ────┐                    │
│       │   │                                  │                    │
│       │   │  community-tag-colors plugin     │                    │
│       │   │  (adds color CSS classes)        │                    │
│       │   │                                  │                    │
│       │   └──────────────────────────────────┘                    │
│       │              │                                             │
│       │              ▼                                             │
│       │       core-tree-view re-renders                            │
│       │              │                                             │
│       │         ┌────┴─────────────────┐                           │
│       │         ▼                      ▼                           │
│       │   UISlot: node:badge     UISlot: node:actions              │
│       │   (word-count badge)     (custom action buttons)           │
│       │                                                            │
└────────────────────────────────────────────────────────────────────┘
```

---

## Summary of Extension Mechanisms

| Mechanism | Purpose | Example |
|---|---|---|
| **Events** | Fire-and-forget notifications | `NODE_CREATED` → undo plugin records it |
| **Hooks** | Pipeline data transformation | `NODE_CONTENT_RENDER` → markdown plugin converts `**bold**` to `<strong>` |
| **UI Slots** | Inject components into layout | Status bar widget, sidebar panel, node badges |
| **RPC Handlers** | Add new backend capabilities | Custom export format, AI completion endpoint |
| **Commands** | User-triggerable actions | "Export to Markdown", "Toggle Dark Mode" |
| **Settings** | Per-plugin configuration | Theme color, keyboard shortcut remapping |
| **Migrations** | Plugin-specific DB tables | Tags table, bookmarks table |
| **CSS Injection** | Visual customization | Custom theme, node decorations |

This design gives the outliner app Obsidian-level extensibility while keeping the core shell under **200 lines of code**. Users can disable `core-drag-drop`, `core-search`, `core-undo-redo`, or `core-breadcrumb` if they want a minimal, fast-loading outliner — just like toggling core plugins in Obsidian.
