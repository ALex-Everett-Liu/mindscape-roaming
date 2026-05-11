import { useRef, useCallback, useEffect, useState } from "preact/hooks";
import { html } from "htm/preact";
import { store } from "../state/store";
import { debounce } from "../utils/debounce";

interface Props {
  searchQuery: string;
  searchAvailable: boolean;
  onSearch: (query: string) => void;
  onOpenSettings?: () => void;
}

export function Toolbar({
  searchQuery,
  searchAvailable,
  onSearch,
  onOpenSettings,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(store.getState());

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  const debouncedSearch = useRef(
    debounce((query: string) => onSearchRef.current(query), 500),
  ).current;

  useEffect(() => {
    return store.subscribe(setState);
  }, []);

  useEffect(() => {
    const handleFocusSearch = () => inputRef.current?.focus();
    window.addEventListener("focus-search", handleFocusSearch);
    return () => window.removeEventListener("focus-search", handleFocusSearch);
  }, []);

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
    [onSearch],
  );

  const handleSave = useCallback(async () => {
    const result = await store.saveAll();
    if (result.error) {
      alert(`Failed to save: ${result.error}`);
    }
    setTimeout(() => store.clearSaveFeedback(), 3000);
  }, []);

  const handleDiscard = useCallback(async () => {
    console.log("[Discard] Toolbar handleDiscard clicked");
    await store.discardAll();
    setTimeout(() => store.clearSaveFeedback(), 3000);
  }, []);

  const hasUnsaved = state.unsavedCount > 0 || state.nonTreeUnsaved;
  const isBusy = state.saveInProgress || state.discardInProgress;

  return html`
    <header class="toolbar">
      <div class="toolbar-left">
        <h1 class="app-title">Outliner</h1>
      </div>
      <div class="toolbar-center">
        ${searchAvailable
          ? html`
              <input
                ref=${inputRef}
                class="search-input"
                type="text"
                placeholder="Search... (Ctrl+F)"
                title="Use AND, OR, NOT, quotes for advanced search"
                value=${searchQuery}
                onInput=${(e: Event) =>
                  debouncedSearch((e.target as HTMLInputElement).value)}
                onKeyDown=${handleSearchKeyDown}
              />
            `
          : html`
              <input
                class="search-input search-input-disabled"
                type="text"
                placeholder="Search (enable Core: Full-Text Search in Settings)"
                disabled
                title="Enable Core: Full-Text Search in Settings"
              />
            `}
      </div>
      <div class="toolbar-right">
        ${hasUnsaved &&
        html`
          <div class="save-discard-group">
            <button
              class="btn btn-save"
              onClick=${handleSave}
              disabled=${isBusy}
              title="Save all changes"
            >
              ${state.saveInProgress
                ? "Saving..."
                : (state.unsavedCount + state.nonTreeUnsavedCount) > 0
                  ? `Save (${state.unsavedCount + state.nonTreeUnsavedCount})`
                  : "Save"}
            </button>
            <button
              class="btn btn-discard"
              onClick=${handleDiscard}
              disabled=${isBusy}
              title="Discard all changes"
            >
              ${state.discardInProgress ? "Discarding..." : "Discard"}
            </button>
          </div>
        `}
        ${state.lastSaveSuccess !== null &&
        !hasUnsaved &&
        html`<span class="save-feedback success"
          >Saved ${state.lastSaveSuccess}!</span
        >`}
        ${state.lastSaveError &&
        !hasUnsaved &&
        html`<span class="save-feedback error">Save failed</span>`}
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
