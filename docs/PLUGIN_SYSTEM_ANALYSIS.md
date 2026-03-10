# Plugin System Analysis & Design Guide

This document analyzes the current plugin system implementation in Luhmann-Roam, evaluates whether it achieves the fastest startup when all plugins are disabled, proposes improvements, and provides guidance for similar plugin systems in other projects.

---

## 1. Current Architecture Overview

### 1.1 Components

| Component | Purpose |
|-----------|---------|
| **PluginRegistry** (`public/js/pluginRegistry.js`) | Central registry: register, enable/disable, launch plugins; persist state in localStorage |
| **Plugin Launchers** | Per-plugin scripts that register with registry, add sidebar buttons, handle modal open/close |
| **Plugin Modal HTML** | In `public/index.html`: wrapper divs + iframes for each plugin |
| **Plugin Modal CSS** | Styles for modal wrappers: `webp-converter-plugin-modal.css`, `image-viewer-plugin-modal.css`, `graph-plugin-modal.css` |
| **Settings Manager** | Renders plugin cards in Settings > Plugins; toggles enable/disable; calls `PluginRegistry.launch()` |

### 1.2 Plugin Load Flow

```
Page load
  → Parse HTML (includes all plugin modal markup)
  → Load CSS (includes all plugin modal CSS)
  → Load scripts synchronously:
      resizableSidebar.js
      pluginRegistry.js
      settingsManager.js
      breadcrumbManager.js, positionManager.js, nodeOperationsManager.js, ...
      cytoscape.min.js (CDN)
      d3.v7.min.js (CDN)
      app.js
      chart.js (CDN)
      webpConverterPluginLauncher.js
      imageViewerPluginLauncher.js
  → DOMContentLoaded
  → app.js initializes (outliner, nodes, etc.)
  → 500ms delay
  → Each launcher: initLauncher()
      → PluginRegistry.initialize()
      → new WebPConverterPluginLauncher() / ImageViewerPluginLauncher()
      → registerPlugin(), addLauncherButton(), setupModalControls()
  → Sidebar shows plugin buttons (enabled or disabled based on localStorage)

User clicks "Launch" on enabled plugin
  → Health check fetch
  → Modal shown, iframe.src = /plugins/{plugin}/index.html
  → Plugin UI loads inside iframe (lazy)
```

### 1.3 What Runs When Plugins Are Disabled?

| Item | When all plugins disabled |
|------|---------------------------|
| Launcher scripts | **Still loaded and executed** — parse, DOMContentLoaded handler, 500ms timeout |
| Launcher `init()` | **Runs** — registers plugin, adds sidebar button (disabled), sets up modal controls |
| Modal HTML | **Already in DOM** — parsed at page load |
| Modal CSS | **Already loaded** — parsed at page load |
| Plugin iframe content | **Not loaded** — iframe `src` is set only when user clicks Launch ✓ |
| Third-party libs (Cytoscape, D3, Chart.js) | **Loaded in main page** — blocking scripts before app.js |

---

## 2. Does It Achieve Fastest Startup When All Plugins Disabled?

**No.** The current design does **not** achieve the fastest possible startup when all plugins are disabled.

### 2.1 What Still Loads (Blocking / Eager)

1. **Plugin launcher scripts** — All launcher JS files are `<script>` tags. The browser parses and executes them before the page is fully ready. Disabled plugins still run their launcher code.

2. **Plugin modal HTML** — WebP and Image Viewer modal wrappers are in the initial HTML. They are parsed, create DOM nodes, and add to layout cost even if never shown.

3. **Plugin modal CSS** — `webp-converter-plugin-modal.css`, `image-viewer-plugin-modal.css` are in `<head>`. Both are fetched and parsed regardless of plugin state. `graph-plugin-modal.css` exists but graph modal HTML is absent and graph launcher is not in index.html (partial integration).

4. **Third-party libraries** — Cytoscape, D3, Chart.js are loaded from CDNs in the main document. Chart.js appears unused in the current codebase. Cytoscape and D3 were likely for a Global Graph Explorer feature that no longer exists in the main app scripts. These add significant parse/compile time and network latency.

5. **PluginRegistry and Settings Manager** — Always loaded. Settings Manager includes the Plugins section and depends on PluginRegistry. Core cannot run without these unless refactored.

### 2.2 What Is Already Lazy (Good)

1. **Plugin UI iframes** — Plugin content (`/plugins/{name}/index.html`) loads only when the user clicks Launch. This is correctly deferred.

2. **Plugin backend APIs** — No plugin-specific API calls until the user launches a plugin.

---

## 3. Startup Cost Summary

| Resource | Approx. size / cost | Loaded when all plugins disabled? |
|----------|---------------------|-----------------------------------|
| webpConverterPluginLauncher.js | ~10 KB | Yes |
| imageViewerPluginLauncher.js | ~10 KB | Yes |
| Cytoscape (CDN) | ~500 KB+ | Yes |
| D3 v7 (CDN) | ~250 KB+ | Yes |
| Chart.js (CDN) | ~200 KB+ | Yes |
| Plugin modal CSS (2–3 files) | ~5–10 KB | Yes |
| Plugin modal HTML | ~1 KB | Yes |
| PluginRegistry.js | ~5 KB | Yes |
| Settings Manager (includes plugin UI) | ~30 KB+ | Yes |

**Total extra cost when plugins disabled:** roughly 1 MB+ of scripts and several CSS files that could be deferred or removed for core-only mode.

---

## 4. Recommendations for Improvement

### 4.1 Lazy-Load Plugin Launchers

**Current:** All launcher scripts are in `index.html` and run on load.

**Improvement:** Load launcher scripts only when:

- The user opens Settings > Plugins, or
- At least one plugin is enabled in localStorage.

```html
<!-- Remove from initial load -->
<!-- <script src="/plugins/webp-converter/webpConverterPluginLauncher.js"></script> -->
<!-- <script src="/plugins/image-viewer/imageViewerPluginLauncher.js"></script> -->
```

```javascript
// In a minimal plugin loader (or Settings Manager)
function loadPluginLaunchers() {
  const enabled = JSON.parse(localStorage.getItem('pluginStates') || '{}');
  const toLoad = [];
  if (enabled['webp-converter-plugin'] !== false) toLoad.push('/plugins/webp-converter/webpConverterPluginLauncher.js');
  if (enabled['image-viewer-plugin'] !== false) toLoad.push('/plugins/image-viewer/imageViewerPluginLauncher.js');
  // Or load all when Settings > Plugins is opened
  toLoad.forEach(src => {
    const s = document.createElement('script');
    s.src = src;
    document.body.appendChild(s);
  });
}
```

Call `loadPluginLaunchers()` when the user first opens Settings > Plugins, or on startup if any plugin is enabled.

### 4.2 Lazy-Load Plugin Modal HTML and CSS

**Current:** Modal wrappers and their CSS are in the initial HTML/CSS.

**Improvement:**

- Inject modal HTML only when a plugin is first launched (or when its launcher loads).
- Load plugin modal CSS only when needed (e.g. `link` with `media="print"` and switch to `all`, or dynamic `link` injection).

### 4.3 Remove or Defer Unused Third-Party Libraries

**Current:** Cytoscape, D3, Chart.js are loaded on every page load.

**Improvement:**

- **Chart.js** — Not referenced in the codebase; remove from `index.html` if unused.
- **Cytoscape / D3** — If only used by the Graph plugin (in its iframe), do not load them in the main document. The graph plugin's own `index.html` should load them when the iframe loads.
- If the main app needs these for a future feature, load them only when that feature is first used.

### 4.4 Minimal PluginRegistry for Core-Only

**Current:** PluginRegistry always loads; Settings Manager always loads and renders the plugins section.

**Improvement:**

- Split Settings Manager so the Plugins section is optional or lazy.
- Provide a minimal core that checks `localStorage.pluginStates` and only loads PluginRegistry + plugin launchers when at least one plugin is enabled or when the user opens Settings.
- Alternatively, load PluginRegistry only when the Settings button is first clicked.

### 4.5 Plugin Manifest for Conditional Loading

Introduce a manifest (e.g. `plugins.json` or inline config) that lists plugins and their entry scripts:

```json
{
  "plugins": [
    { "id": "webp-converter-plugin", "launcher": "/plugins/webp-converter/webpConverterPluginLauncher.js" },
    { "id": "image-viewer-plugin", "launcher": "/plugins/image-viewer/imageViewerPluginLauncher.js" }
  ]
}
```

The core loads this manifest (small JSON) and, based on enabled state or user action, dynamically loads only the required launcher scripts.

---

## 5. Design Guide for Similar Plugin Systems

Use this checklist when building plugin systems where “core-only” should have minimal startup cost.

### 5.1 Principles

| Principle | Implementation |
|-----------|----------------|
| **Zero plugin cost when disabled** | Do not parse, fetch, or execute plugin code when all plugins are disabled. |
| **Lazy launcher load** | Load launcher scripts only when a plugin is enabled or when the user opens plugin management. |
| **Lazy plugin UI load** | Load plugin UI (iframe, component) only when the user launches the plugin. ✓ (already done) |
| **No plugin HTML/CSS in initial payload** | Inject modal/container HTML and CSS when the plugin is first needed. |
| **Third-party libs with plugins** | Load heavy libs (e.g. D3, Chart.js) inside plugin boundaries (iframe or chunk), not in the core bundle. |

### 5.2 Architecture Patterns

#### Pattern A: Dynamic Script Loading (Recommended)

```
Core loads
  → Minimal bootstrap (app shell, PluginRegistry stub)
  → Check pluginStates
  → If any enabled: dynamically load those launchers
  → If user opens Settings > Plugins: load all launchers (or manifest)

Launcher loads
  → Register with PluginRegistry
  → Add sidebar button
  → Inject modal HTML/CSS when first needed (or on register)
```

#### Pattern B: Build-Time Plugin Exclusion

For bundled apps (e.g. Webpack/Vite), use an environment variable or build flag to exclude plugin chunks from the core bundle. The core loads a stub; plugin chunks load on demand.

#### Pattern C: Separate Plugin Host (Iframes / Workers)

Plugins run in iframes or web workers. The main page never loads plugin scripts; it only loads a small bridge that communicates with plugin iframes. This provides strong isolation and guarantees zero plugin cost when not launched.

### 5.3 Implementation Checklist

- [ ] No plugin launcher `<script>` tags in the initial HTML when targeting “core-only” mode.
- [ ] Plugin launchers loaded via `createElement('script')` or dynamic `import()` only when needed.
- [ ] Plugin modal/container HTML injected when plugin is first launched, not in initial DOM.
- [ ] Plugin-specific CSS loaded on demand (dynamic `link` or scoped to plugin chunk).
- [ ] Third-party libraries used only by plugins are not in the core bundle.
- [ ] Plugin manifest or config used to decide which launchers to load.
- [ ] Settings > Plugins works even when launchers are not yet loaded (e.g. load on first open).
- [ ] Clear separation: core vs. plugin registry vs. plugin launchers vs. plugin UI.

### 5.4 Measurement

- Use **Lighthouse** or **Chrome DevTools Performance** to measure:
  - Time to Interactive (TTI)
  - Total Blocking Time (TBT)
  - Script parse/compile time
- Compare “all plugins disabled” vs. “all plugins enabled” vs. “core-only build.”
- Track script sizes: core bundle vs. plugin launchers vs. plugin UIs vs. third-party libs.

---

## 6. Summary

| Question | Answer |
|----------|--------|
| **Does the current system achieve fastest startup when all plugins disabled?** | No. Launcher scripts, modal HTML/CSS, and several third-party libs load eagerly. |
| **What is already good?** | Plugin iframe content loads only on Launch. |
| **Main gaps** | Eager launcher scripts, modal HTML/CSS in initial payload, Cytoscape/D3/Chart.js in main page. |
| **High-impact changes** | Lazy-load launchers; defer or remove Cytoscape, D3, Chart.js from core; inject plugin modal HTML/CSS on demand. |
| **Core principle** | Core-only mode should load no plugin code, HTML, or CSS until the user enables a plugin or opens plugin management. |

For new projects, adopt **lazy launcher loading** and **on-demand modal injection** from the start. Treat plugin enable/disable as a hint for what to load, not just for UI visibility.
