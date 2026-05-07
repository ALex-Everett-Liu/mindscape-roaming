import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";
import { debounce } from "../../utils/debounce";

const CSS = `
.move-node-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.move-node-modal {
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.move-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border, #333);
}

.move-node-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #e0e0e0);
}

.move-node-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 1;
}

.move-node-close:hover {
  color: var(--text, #e0e0e0);
}

.move-node-body {
  padding: 16px 18px;
}

.move-node-field {
  margin-bottom: 14px;
}

.move-node-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #888);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.move-node-source {
  padding: 8px 10px;
  background: var(--bg, #1a1a2e);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  color: var(--text-muted, #888);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.move-node-field input[type="text"] {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, #333);
  background: var(--bg, #1a1a2e);
  color: var(--text, #e0e0e0);
  font-size: 14px;
  outline: none;
  font-family: inherit;
}

.move-node-field input:focus {
  border-color: var(--accent, #4fc3f7);
}

.move-node-search-results {
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  margin-top: 4px;
  background: var(--bg, #1a1a2e);
}

.move-node-search-result {
  padding: 7px 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text, #e0e0e0);
  border-bottom: 1px solid var(--border, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.move-node-search-result:last-child {
  border-bottom: none;
}

.move-node-search-result:hover,
.move-node-search-result.selected {
  background: var(--focus-bg, rgba(255,255,255,0.08));
}

.move-node-search-result .breadcrumb {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 2px;
}

.move-node-selected {
  padding: 8px 10px;
  background: var(--bg, #1a1a2e);
  border: 1px solid var(--accent, #4fc3f7);
  border-radius: 6px;
  color: var(--text, #e0e0e0);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.move-node-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border, #333);
}

.move-node-error {
  margin: 0 18px 8px;
  padding: 8px 12px;
  background: rgba(229, 115, 115, 0.15);
  border: 1px solid rgba(229, 115, 115, 0.4);
  border-radius: 6px;
  color: #e57373;
  font-size: 13px;
}
`;

let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;
let overlayEl: HTMLElement | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

function injectCSS(): void {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

function removeCSS(): void {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

function destroyOverlay(): void {
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function updateSearchSelection(
  items: NodeListOf<Element>,
  index: number,
): void {
  items.forEach((el, i) => {
    el.classList.toggle("selected", i === index);
  });
}

async function openMoveOverlay(sourceId: string): Promise<void> {
  destroyOverlay();

  const sourceNode = await api.getNode(sourceId);
  const sourceContent = sourceNode.data?.content || "(empty)";

  overlayEl = document.createElement("div");
  overlayEl.className = "move-node-overlay";
  overlayEl.innerHTML = `
    <div class="move-node-modal">
      <div class="move-node-header">
        <h3>Move Node to Parent</h3>
        <button class="move-node-close">&times;</button>
      </div>
      <div class="move-node-body">
        <div class="move-node-field">
          <label>Source</label>
          <div class="move-node-source">${escapeHtml(sourceContent)}</div>
        </div>
        <div class="move-node-field">
          <label>Target parent</label>
          <input type="text" class="move-node-target-search" placeholder="Search for a parent node..." autocomplete="off" />
          <div class="move-node-search-results" style="display:none"></div>
        </div>
      </div>
      <div class="move-node-actions">
        <button class="btn btn-secondary move-node-cancel">Cancel</button>
        <button class="btn btn-primary move-node-confirm" disabled>Move</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  // Close on overlay click (click-outside)
  overlayEl.addEventListener("mousedown", (e) => {
    if (e.target === overlayEl) destroyOverlay();
  });

  const closeBtn = overlayEl.querySelector(".move-node-close");
  const cancelBtn = overlayEl.querySelector(".move-node-cancel");
  const confirmBtn = overlayEl.querySelector(".move-node-confirm") as HTMLButtonElement;
  const targetInput = overlayEl.querySelector(".move-node-target-search") as HTMLInputElement;
  const resultsEl = overlayEl.querySelector(".move-node-search-results") as HTMLDivElement;
  const errorContainer = document.createElement("div");

  closeBtn?.addEventListener("mousedown", () => destroyOverlay());
  cancelBtn?.addEventListener("mousedown", () => destroyOverlay());

  let selectedTargetId: string | null = null;
  let selectedIndex = -1;

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") destroyOverlay();
  };
  document.addEventListener("keydown", onKey);
  keyHandler = onKey;

  const debouncedSearch = debounce(async (q: string) => {
    const res = await api.search({ query: q, limit: 8 });
    if (!res.success || !res.data) return;
    const nodes = res.data;
    selectedIndex = -1;
    resultsEl.innerHTML = nodes
      .map(
        (n, idx) => {
          const crumb = n.breadcrumb.length > 0
            ? `<span class="breadcrumb">${escapeHtml(n.breadcrumb.join(" > "))}</span>`
            : "";
          return `<div class="move-node-search-result" data-index="${idx}" data-id="${n.id}">${escapeHtml(n.content || "(empty)")}${crumb}</div>`;
        }
      )
      .join("");
    resultsEl.style.display = nodes.length > 0 ? "block" : "none";
  }, 500);

  targetInput.addEventListener("input", () => {
    const q = targetInput.value.trim();
    if (!q) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
      selectedTargetId = null;
      selectedIndex = -1;
      return;
    }
    debouncedSearch(q);
  });

  // Remove previous error
  function clearError(): void {
    if (errorContainer.parentNode) errorContainer.remove();
  }

  resultsEl.addEventListener("mousedown", (e) => {
    const item = (e.target as HTMLElement).closest(".move-node-search-result") as HTMLElement | null;
    if (!item) return;
    e.preventDefault();
    clearError();
    selectedTargetId = item.dataset.id || null;
    targetInput.value = item.textContent || "";
    resultsEl.style.display = "none";
    confirmBtn.disabled = false;
  });

  targetInput.addEventListener("keydown", (e) => {
    const items = resultsEl.querySelectorAll(".move-node-search-result");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex + 1) % items.length;
      updateSearchSelection(items, selectedIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSearchSelection(items, selectedIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        const item = items[selectedIndex] as HTMLElement;
        clearError();
        selectedTargetId = item.dataset.id || null;
        targetInput.value = item.textContent || "";
        resultsEl.style.display = "none";
        confirmBtn.disabled = false;
      }
    }
  });

  confirmBtn.addEventListener("mousedown", async (e) => {
    e.preventDefault();
    if (!selectedTargetId) return;

    if (selectedTargetId === sourceId) {
      clearError();
      errorContainer.className = "move-node-error";
      errorContainer.textContent = "Cannot move a node under itself.";
      const actions = overlayEl!.querySelector(".move-node-actions");
      if (actions && actions.parentNode) {
        actions.parentNode.insertBefore(errorContainer, actions);
      }
      return;
    }

    destroyOverlay();
    if (ctxRef) {
      await ctxRef.emit("action:moveNodeTo", sourceId, selectedTargetId);
    }
  });

  targetInput.focus();
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    injectCSS();

    ctx.registerCommand({
      id: "move-to-parent",
      name: "Move Node to Parent",
      category: "Edit",
      keywords: ["move", "reparent", "relocate"],
      execute: () => {
        const nodeId = store.getState().focusedNodeId;
        if (!nodeId) return;
        void openMoveOverlay(nodeId);
      },
    });

    await ctx.emit("context-menu:register", {
      id: "move-to-parent",
      pluginId: manifest.id,
      label: "Move to...",
      execute: (nodeId: string) => {
        void openMoveOverlay(nodeId);
      },
    });

    console.log("[core-move-node] renderer ready");
  },

  async onUnload() {
    destroyOverlay();

    if (ctxRef) {
      ctxRef.unregisterCommand("move-to-parent");
      await ctxRef.emit("context-menu:unregister", {
        pluginId: manifest.id,
        id: "move-to-parent",
      });
      ctxRef = null;
    }

    removeCSS();
  },
};

export default plugin;
