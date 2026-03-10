# Plugin System Comparison

This document compares Mindscape-Roaming's plugin implementation with the analysis and design guide from another project (Luhmann-Roam, a browser-based outliner). The reference doc emphasizes **minimal startup cost when plugins are disabled** and provides principles for building efficient plugin systems.

---

## 1. Reference vs This Project: Side-by-Side

| Aspect | Reference (Luhmann-Roam) | Mindscape-Roaming |
|--------|--------------------------|-------------------|
| **Platform** | Browser (web app) | Electrobun (desktop: Bun + BrowserView) |
| **Plugin runtime** | Browser main thread | Main process (Bun), plugins register RPC handlers |
| **Registry** | `PluginRegistry` (JS) | `PluginManager` (TypeScript) |
| **Persistence** | localStorage | SQLite (`_plugin_state` table) |
| **Plugin discovery** | Script tags in HTML, per-plugin launchers | Skeleton config + static imports in `loadPlugins.ts` |
| **Plugin UI** | Iframes, load on Launch click | N/A (main-only plugins so far; renderer plugins planned) |
| **Settings UI** | Settings Manager, plugin cards | `PluginSettingsView`, RPC to main |
| **Third-party libs** | Cytoscape, D3, Chart.js in main page | None in core; plugins own their deps |

---

## 2. Architecture Comparison

### Reference Architecture (Luhmann-Roam)

```
Page load
  → Parse HTML (all plugin modal markup)
  → Load CSS (all plugin modal styles)
  → Load scripts: pluginRegistry, settingsManager, cytoscape, d3, chart.js,
     webpConverterPluginLauncher.js, imageViewerPluginLauncher.js, ...
  → DOMContentLoaded → 500ms delay
  → Each launcher: initLauncher() → registerPlugin(), addSidebarButton(), setupModalControls()
  → User clicks Launch → iframe.src = /plugins/{name}/index.html (lazy)
```

**Problem**: Launcher scripts, modal HTML/CSS, and third-party libs load eagerly even when all plugins are disabled.

### Mindscape-Roaming Architecture

```
App start
  → Bootstrap: db, PluginManager
  → loadMainPlugins(): get skeleton → static import only plugins in skeleton
  → Bundler tree-shakes excluded plugins (not in bundle at all)
  → pluginManager.register(plugin) for each
  → pluginManager.loadAll(): resolve dependencies → load in order
  → buildRpcHandlers() → BrowserView.defineRPC()
  → User toggles in Settings → enablePlugin / disablePlugin (load/unload at runtime)
```

**Advantage**: Build-time skeleton excludes plugins from the bundle. At runtime, disabled plugins are not loaded (no `onLoad`).

---

## 3. How Well Does Mindscape Achieve "Zero Plugin Cost When Disabled"?

### 3.1 Build-Time (Skeleton)

| Principle | Reference recommendation | Mindscape implementation | Status |
|-----------|--------------------------|---------------------------|--------|
| No plugin code in core when targeting minimal | Lazy-load launchers, or exclude at build | `SKELETON=minimal` → only `core-node-ops`, `core-tree-view`, etc. | ✅ Achieved |
| Plugin manifest for conditional loading | `plugins.json` with launcher paths | `skeletons.config.ts` + `loadPlugins.ts` | ✅ Achieved |
| Third-party libs not in core | Load inside plugin iframes | Plugins own deps; no Cytoscape/D3 in main | ✅ Achieved |

### 3.2 Runtime (Enable/Disable)

| Principle | Reference recommendation | Mindscape implementation | Status |
|-----------|--------------------------|---------------------------|--------|
| Disabled plugins not executed | Lazy launcher load when enabled | `loadPlugin()` only for enabled plugins | ✅ Achieved |
| Lazy plugin UI load | Iframe/component loads on Launch | Main plugins have no UI; renderer plugins TBD | ⚠️ N/A so far |
| No plugin HTML/CSS in initial payload | Inject on demand | No plugin modal markup in shell | ✅ N/A |

### 3.3 Gaps / Differences

| Gap | Reference | Mindscape |
|-----|-----------|-----------|
| **All plugins in bundle for non-minimal** | Reference: all launcher scripts always in HTML | Mindscape: `standard`/`full` skeletons bundle more plugins; tree-shaking removes only excluded skeletons |
| **Lazy launcher load at runtime** | Reference suggests loading launcher scripts via `createElement('script')` when needed | Mindscape uses static imports; plugin code is in bundle for the selected skeleton. No dynamic script loading. |
| **Renderer plugins** | N/A | Architecture doc describes `RendererPluginManager`, UISlots; not yet implemented. Renderer is monolithic. |

---

## 4. Feature Comparison

### 4.1 Reference Has; Mindscape Lacks

| Feature | Notes |
|---------|------|
| **Dynamic script loading** | Reference recommends loading launcher scripts only when plugin enabled or Settings opened. Mindscape uses static imports; all skeleton plugins are bundled. |
| **Lazy modal HTML/CSS injection** | Reference: inject plugin UI containers on demand. Mindscape has no plugin modals. |
| **Separate plugin host (iframes)** | Reference Pattern C: plugins in iframes for isolation. Mindscape runs main plugins in same Bun process. |
| **Plugin manifest as runtime config** | Reference: `plugins.json` drives conditional loading. Mindscape uses `skeletons.config.ts` (build-time). |

### 4.2 Mindscape Has; Reference Lacks

| Feature | Notes |
|---------|------|
| **Dependency resolution** | `DependencyResolver` with topological sort; `dependencies`, `essential`, load order. |
| **Database-backed state** | SQLite `_plugin_state`; migrations via `runMigration()`. |
| **RPC handler registration** | Plugins register handlers; main builds single RPC surface for renderer. |
| **EventBus** | `CoreEvents` (e.g. `PLUGIN_LOADED`, `NODE_CREATED`); cross-plugin communication. |
| **Build-time skeleton profiles** | `minimal` / `standard` / `full`; `SKELETON=minimal bun run build` produces smaller binary. |
| **Runtime enable/disable with unload** | `disablePlugin()` calls `onUnload()`, removes RPC handlers, emits `PLUGIN_UNLOADED`. |
| **Essential plugins** | Cannot be disabled; dependency checks prevent breaking dependent plugins. |

---

## 5. Design Principles Checklist (from Reference §5.3)

| Checklist Item | Mindscape | Notes |
|----------------|-----------|-------|
| No plugin launcher `<script>` in initial HTML | ✅ N/A | Desktop app; no HTML script tags for plugins |
| Launchers loaded via dynamic `import()` or `createElement('script')` when needed | ❌ | Static imports; skeleton filters at build, not runtime |
| Plugin modal/container HTML injected when launched | ✅ N/A | No plugin modals |
| Plugin-specific CSS on demand | ✅ N/A | No plugin CSS in shell |
| Third-party libs used only by plugins not in core | ✅ | No heavy libs in main |
| Plugin manifest/config for conditional loading | ✅ | `skeletons.config.ts` + manifests |
| Settings > Plugins works when launchers not loaded | ✅ | RPC; main always has PluginManager |
| Clear separation: core vs registry vs launchers vs UI | ✅ | PluginManager, loadPlugins, plugins/, renderer |

---

## 6. Recommendations for Mindscape

Based on the reference guide, these improvements could bring Mindscape closer to optimal "core-only" startup:

### 6.1 (Optional) Runtime Lazy Plugin Loading

**Current**: All plugins for the chosen skeleton are statically imported and registered at startup. Disabled plugins are not loaded (`onLoad` not called) but their code is in the bundle.

**Improvement**: For non-essential plugins, consider dynamic `import()` when the user enables them (or when Settings > Plugins is first opened). Requires:
- Manifest with entry path (e.g. `"/plugins/core-fts-search/index"`)
- Lazy load: `const m = await import(manifest.entry); pluginManager.register(m.default)`
- Trade-off: More complexity; may need build config to emit separate chunks.

### 6.2 Renderer Plugin System

When implementing `RendererPluginManager` and renderer plugins:
- Avoid loading renderer plugin code until enabled or first use.
- Use UISlots / lazy components so plugin UI is injected on demand, not in initial DOM.
- Keep plugin-specific CSS scoped to plugin chunks.

### 6.3 Plugin Manifest as Runtime Discovery (Future Third-Party Plugins)

For user-installed plugins in a `plugins/` directory:
- Use a manifest file per plugin (or `plugins.json`) for discovery.
- Load only when enabled; dynamic import or separate process/worker for isolation.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| **Does Mindscape achieve zero plugin cost when disabled?** | Partially. Build-time: yes for excluded skeletons. Runtime: disabled plugins are not loaded, but their code remains in the bundle for the chosen skeleton. |
| **What is already strong?** | Skeleton-based build exclusion, dependency resolution, SQLite persistence, RPC/EventBus design, essential plugins, runtime enable/disable with unload. |
| **Main gaps vs reference** | No runtime lazy loading of plugin code (dynamic import); renderer plugin system not yet implemented. |
| **Core principle alignment** | Mindscape aligns well: core shell is minimal; plugins own their logic; third-party libs stay out of core; manifest/skeleton drives conditional inclusion. |

The reference doc focuses on **browser** startup cost (parse, network, script execution). Mindscape, as a desktop app with a Bun main process, faces different constraints: bundle size and cold-start time. Its skeleton system and enable/disable flow address these effectively, while the reference's dynamic launcher loading could be adopted if runtime-only plugin activation becomes a priority.
