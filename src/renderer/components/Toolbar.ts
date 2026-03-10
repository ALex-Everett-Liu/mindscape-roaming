import { useRef, useCallback } from "preact/hooks";
import { html } from "htm/preact";
import { store } from "../state/store";

interface Props {
  searchQuery: string;
  onSearch: (query: string) => void;
  onOpenSettings?: () => void;
}

export function Toolbar({ searchQuery, onSearch, onOpenSettings }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreateRoot = useCallback(() => {
    store.createNode(null, store.getState().zoomedNodeId);
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSearch("");
        inputRef.current?.blur();
      }
    },
    [onSearch]
  );

  return html`
    <header class="toolbar">
      <div class="toolbar-left">
        <h1 class="app-title">Outliner</h1>
      </div>
      <div class="toolbar-center">
        <input
          ref=${inputRef}
          class="search-input"
          type="text"
          placeholder="Search... (Ctrl+F)"
          value=${searchQuery}
          onInput=${(e: Event) => onSearch((e.target as HTMLInputElement).value)}
          onKeyDown=${handleSearchKeyDown}
        />
      </div>
      <div class="toolbar-right">
        ${onOpenSettings &&
        html`
          <button
            class="btn btn-icon"
            onClick=${onOpenSettings}
            title="Plugin settings"
            aria-label="Settings"
          >
            ⚙
          </button>
        `}
        <button class="btn" onClick=${handleCreateRoot}>+ New Item</button>
      </div>
    </header>
  `;
}
