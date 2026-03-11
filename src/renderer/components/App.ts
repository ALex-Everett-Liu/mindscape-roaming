import { useState, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { store, type AppState } from "../state/store";
import { Toolbar } from "./Toolbar";
import { Breadcrumb } from "./Breadcrumb";
import { OutlineTree } from "./OutlineTree";
import { PluginSettingsView } from "./PluginSettingsView";
import { syncRendererPluginState } from "../plugin-system/loadRendererPlugins";
import { onDragDropStateChange } from "../plugin-system/dragDropPluginState";

export function App() {
  const [state, setState] = useState<AppState>(store.getState());
  const [showSettings, setShowSettings] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    return store.subscribe(setState);
  }, []);

  useEffect(() => {
    return onDragDropStateChange(() => forceUpdate((n) => n + 1));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (store.hasUnsavedChanges()) {
          store.saveAll();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (state.loading) {
    return html`<div class="loading">Loading...</div>`;
  }

  return html`
    <div class="app">
      <${Toolbar}
        searchQuery=${state.searchQuery}
        searchAvailable=${state.searchAvailable}
        onSearch=${(q: string) => store.search(q)}
        onOpenSettings=${() => setShowSettings(true)}
      />

      ${state.breadcrumbs.length > 0 &&
      html`
        <${Breadcrumb}
          ancestors=${state.breadcrumbs}
          onNavigate=${(id: string | null) =>
            id ? store.zoomIn(id) : store.zoomToRoot()}
        />
      `}

      ${state.searchQuery
        ? html`
            <div class="search-results">
              ${state.searchResults.map(
                (node) =>
                  html`
                    <div
                      class="search-result"
                      onClick=${() => {
                        store.search("");
                        store.zoomIn(node.id);
                      }}
                    >
                      ${node.content || "(empty)"}
                    </div>
                  `
              )}
            </div>
          `
        : html`
            <${OutlineTree}
              nodes=${state.tree}
              focusedNodeId=${state.focusedNodeId}
            />
          `}

      ${showSettings &&
      html`<${PluginSettingsView}
        onClose=${async () => {
          setShowSettings(false);
          await store.refreshSearchAvailability();
          await syncRendererPluginState();
        }}
      />`}
    </div>
  `;
}
