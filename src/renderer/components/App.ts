import { useState, useEffect, useRef } from "preact/hooks";
import { html } from "htm/preact";
import { store, type AppState } from "../state/store";
import { Toolbar } from "./Toolbar";
import { Breadcrumb } from "./Breadcrumb";
import { OutlineTree } from "./OutlineTree";
import { PluginSettingsView } from "./PluginSettingsView";
import { syncRendererPluginState } from "../plugin-system/loadRendererPlugins";
import { onDragDropStateChange } from "../plugin-system/dragDropPluginState";

function highlightContent(text: string, query: string): any[] {
  const tokens = query.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [text];

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const elements: any[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    elements.push(html`<mark class="search-highlight">${match[1]}</mark>`);
    lastIndex = match.index + match[1].length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? elements : [text];
}

export function App() {
  const [state, setState] = useState<AppState>(store.getState());
  const [showSettings, setShowSettings] = useState(false);
  const [, forceUpdate] = useState(0);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(-1);
  const selectedIndexRef = useRef(-1);

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

  useEffect(() => {
    selectedIndexRef.current = selectedSearchIndex;
  }, [selectedSearchIndex]);

  useEffect(() => {
    if (!state.searchQuery) setSelectedSearchIndex(-1);
  }, [state.searchQuery]);

  useEffect(() => {
    if (!state.searchQuery || state.searchResults.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSearchIndex((prev) => {
          const len = state.searchResults.length;
          if (e.key === "ArrowDown") return (prev + 1) % len;
          return (prev - 1 + len) % len;
        });
      } else if (e.key === "Enter") {
        const idx = selectedIndexRef.current >= 0 ? selectedIndexRef.current : 0;
        const node = state.searchResults[idx];
        if (node) {
          store.search("");
          store.zoomIn(node.id);
        }
      } else if (e.key === "Escape") {
        store.search("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.searchQuery, state.searchResults]);

  useEffect(() => {
    if (selectedSearchIndex >= 0) {
      const el = document.querySelector(`.search-result:nth-child(${selectedSearchIndex + 1})`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedSearchIndex]);

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
          onHome=${() => store.zoomToRoot()}
          onNavigateToAncestor=${(id: string) => store.zoomIn(id)}
        />
      `}

      ${state.searchQuery
        ? html`
            <div class="search-results">
              ${state.searchResults.length === 0
                ? html`<div class="search-empty">No matches found</div>`
                : state.searchResults.map(
                    (node, idx) =>
                      html`
                        <div
                          class=${`search-result ${idx === selectedSearchIndex ? "search-result-selected" : ""}`}
                          onClick=${() => {
                            store.search("");
                            store.zoomIn(node.id);
                          }}
                        >
                          <div class="search-result-content">
                            ${node.content
                              ? highlightContent(node.content, state.searchQuery)
                              : html`<em class="search-empty-content">(empty)</em>`}
                          </div>
                          ${node.breadcrumb.length > 0 &&
                          html`
                            <div class="search-result-breadcrumb">
                              ${node.breadcrumb.join(" > ")}
                            </div>
                          `}
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
