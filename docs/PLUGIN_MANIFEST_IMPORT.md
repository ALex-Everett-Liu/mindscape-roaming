# Plugin Development: Manifest Import Requirement

## The Bug

When creating a new renderer plugin, forgetting `import { manifest } from "./manifest"` causes the entire renderer process to crash on startup with no visible error — just a frozen loading screen.

### What happened

During the `core-context-menu` plugin implementation, the renderer plugin file had these imports:

```typescript
import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
// ⚠️ MISSING: import { manifest } from "./manifest";
```

But the plugin object referenced `manifest` as a bare identifier:

```typescript
const plugin: RendererPlugin = {
  manifest,  // ReferenceError — manifest is undefined
  async onLoad(ctx) { ... },
};
```

There was **no compile error** because:
- `PluginManifest` is a type-only import from `plugin-types`, and TypeScript allowed `manifest` as an inferred property
- The bundler (Electrobun) doesn't flag undefined references at build time

But at runtime, the JavaScript module throws a `ReferenceError: manifest is not defined` during module evaluation — before any plugin `onLoad` code runs. The renderer process never initializes, producing a blank/frozen startup screen.

### Root cause

The plugin system requires every plugin to export its manifest. The convention is:

```
plugin-name/
  manifest.ts   ← exports const manifest: PluginManifest
  index.ts      ← import { manifest } from "./manifest"
```

Unlike `loadRendererPlugins.ts` which accesses plugins via `coreKeyboard.manifest` (object property access), the plugin's own `index.ts` uses `manifest` as a bare identifier. Both patterns reference the same manifest object, but the plugin file must have its own import.

### Detection

- **Build time**: No error (type-only imports don't enforce runtime existence)
- **Runtime**: App freezes on startup screen — no visible error, no console output accessible
- **Diagnosis method**: `git bisect` or checkout to last-known-good commit to isolate the breaking change

### Prevention

1. **Always copy from a working plugin** when creating new plugin files — the import boilerplate is identical across all plugins
2. **Check the import section** before closing a new plugin file
3. Consider adding a lint rule (ESLint `no-undef`) to catch undefined identifiers — though this would need the ESLint config to not use `types`-only mode

### Example — Correct boilerplate

**Renderer plugin** (`src/renderer/plugins/my-plugin/index.ts`):

```typescript
import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";

const plugin: RendererPlugin = {
  manifest,
  async onLoad(ctx: RendererPluginContext) { },
  async onUnload() { },
};

export default plugin;
```

**Main plugin** (`src/main/plugins/my-plugin/index.ts`):

```typescript
import type { MainPlugin } from "../../plugin-system/PluginManifest";
import type { MainPluginContext } from "../../plugin-system/PluginContext";
import { manifest } from "./manifest";

const plugin: MainPlugin = {
  manifest,
  async onLoad(ctx: MainPluginContext) { },
};

export default plugin;
```
