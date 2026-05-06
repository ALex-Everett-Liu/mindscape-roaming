import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { api } from "../../rpc/api";
import { store } from "../../state/store";
import type { OutlineNode } from "../../../shared/types";

const CSS = `
.node-size-overlay {
  position: fixed;
  inset: 0;
  z-index: 1004;
}
.node-size-popup {
  position: fixed;
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border, #333);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  min-width: 280px;
  max-width: 360px;
  font-size: 13px;
  z-index: 1005;
  overflow: hidden;
}
.node-size-popup-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, #333);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.node-size-popup-title {
  font-weight: 600;
  color: var(--text, #e0e0e0);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-size-popup-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
  flex-shrink: 0;
}
.node-size-popup-close:hover {
  color: var(--text, #e0e0e0);
}
.node-size-popup-body {
  padding: 12px 14px;
}
.node-size-content-preview {
  color: var(--text, #e0e0e0);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 14px;
  padding: 8px 10px;
  background: var(--bg, #1a1a2e);
  border-radius: 6px;
  border-left: 3px solid var(--accent, #4fc3f7);
  word-break: break-word;
  max-height: 60px;
  overflow-y: auto;
}
.node-size-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.node-size-slider {
  flex: 1;
  accent-color: var(--accent, #4fc3f7);
  height: 4px;
}
.node-size-input {
  width: 62px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid var(--border, #333);
  background: var(--bg, #1a1a2e);
  color: var(--text, #e0e0e0);
  font-size: 13px;
  text-align: center;
  outline: none;
  font-family: var(--font-mono, monospace);
}
.node-size-input:focus {
  border-color: var(--accent, #4fc3f7);
}
.node-size-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border, #333);
}
.node-size-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.node-size-btn-apply {
  background: var(--accent, #4fc3f7);
  color: #000;
}
.node-size-btn-apply:hover {
  background: var(--accent-hover, #81d4fa);
}
.node-size-btn-cancel {
  background: transparent;
  color: var(--text-muted, #888);
  border: 1px solid var(--border, #333);
}
.node-size-btn-cancel:hover {
  background: var(--focus-bg, rgba(255,255,255,0.05));
  color: var(--text, #e0e0e0);
}

/* ─── Query overlay ─── */
.node-size-query-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1006;
}
.node-size-query-panel {
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  width: 460px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.node-size-query-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border, #333);
}
.node-size-query-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #e0e0e0);
}
.node-size-query-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 1;
}
.node-size-query-close:hover {
  color: var(--text, #e0e0e0);
}
.node-size-query-body {
  padding: 16px 18px;
}
.node-size-query-field {
  margin-bottom: 10px;
}
.node-size-query-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #888);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.node-size-query-row {
  display: flex;
  gap: 12px;
}
.node-size-query-row > .node-size-query-field {
  flex: 1;
}
.node-size-query-field input[type="number"] {
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
.node-size-query-field input:focus {
  border-color: var(--accent, #4fc3f7);
}
.node-size-query-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border, #333);
}
.node-size-query-actions .btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}
.node-size-query-actions .btn-primary {
  background: var(--accent, #4fc3f7);
  color: #000;
}
.node-size-query-actions .btn-primary:hover {
  background: var(--accent-hover, #81d4fa);
}
.node-size-query-actions .btn-secondary {
  background: transparent;
  color: var(--text-muted, #888);
  border: 1px solid var(--border, #333);
}
.node-size-query-actions .btn-secondary:hover {
  background: var(--focus-bg, rgba(255,255,255,0.05));
  color: var(--text, #e0e0e0);
}
.node-size-query-results {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  margin-top: 12px;
  background: var(--bg, #1a1a2e);
}
.node-size-query-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text, #e0e0e0);
  border-bottom: 1px solid var(--border, #333);
  transition: background 0.1s;
}
.node-size-query-result:last-child {
  border-bottom: none;
}
.node-size-query-result:hover {
  background: var(--focus-bg, rgba(255,255,255,0.05));
}
.node-size-query-result-content {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-size-query-result-badge {
  flex-shrink: 0;
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(79, 195, 247, 0.15);
  color: var(--accent, #4fc3f7);
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
}
.node-size-query-empty {
  padding: 20px 14px;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 12px;
  font-style: italic;
}
`;

let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;
let popupEl: HTMLElement | null = null;
let popupOverlay: HTMLElement | null = null;
let popupKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let queryEl: HTMLElement | null = null;
let queryKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function clampSize(v: number): number {
  return Math.max(0.1, Math.min(100.0, Math.round(v * 10) / 10));
}

/* ─── CSS ─── */

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

/* ─── Size editor popup ─── */

function destroySizePopup(): void {
  if (popupKeyHandler) {
    document.removeEventListener("keydown", popupKeyHandler);
    popupKeyHandler = null;
  }
  if (popupOverlay) {
    popupOverlay.remove();
    popupOverlay = null;
  }
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }
}

function openSizePopup(node: OutlineNode, x: number, y: number): void {
  destroySizePopup();
  destroyQueryOverlay();

  popupEl = document.createElement("div");
  popupEl.className = "node-size-popup";

  const contentPreview = escapeHtml(node.content || "(empty)");
  const currentSize = node.node_size;

  popupEl.innerHTML = `
    <div class="node-size-popup-header">
      <span class="node-size-popup-title">Node Size</span>
      <button class="node-size-popup-close">&times;</button>
    </div>
    <div class="node-size-popup-body">
      <div class="node-size-content-preview">${contentPreview}</div>
      <div class="node-size-row">
        <input type="range" class="node-size-slider" min="0.1" max="100.0" step="0.1" value="${currentSize}" />
        <input type="number" class="node-size-input" min="0.1" max="100.0" step="0.1" value="${currentSize}" />
      </div>
      <div class="node-size-actions">
        <button class="node-size-btn node-size-btn-cancel">Cancel</button>
        <button class="node-size-btn node-size-btn-apply">Apply</button>
      </div>
    </div>
  `;

  popupOverlay = document.createElement("div");
  popupOverlay.className = "node-size-overlay";
  document.body.appendChild(popupOverlay);
  document.body.appendChild(popupEl);

  const slider = popupEl.querySelector(".node-size-slider") as HTMLInputElement;
  const numberInput = popupEl.querySelector(".node-size-input") as HTMLInputElement;
  const closeBtn = popupEl.querySelector(".node-size-popup-close") as HTMLButtonElement;
  const cancelBtn = popupEl.querySelector(".node-size-btn-cancel") as HTMLButtonElement;
  const applyBtn = popupEl.querySelector(".node-size-btn-apply") as HTMLButtonElement;

  slider.addEventListener("input", () => {
    numberInput.value = slider.value;
  });

  numberInput.addEventListener("input", () => {
    const v = parseFloat(numberInput.value);
    if (!isNaN(v)) {
      slider.value = String(clampSize(v));
    }
  });

  numberInput.addEventListener("blur", () => {
    const v = parseFloat(numberInput.value);
    if (isNaN(v) || v < 0.1 || v > 100.0) {
      numberInput.value = String(currentSize);
      slider.value = String(currentSize);
    } else {
      const clamped = clampSize(v);
      numberInput.value = String(clamped);
      slider.value = String(clamped);
    }
  });

  // Position clamped to viewport
  let px = Math.max(0, x);
  let py = Math.max(0, y);
  const menuWidth = 300;
  const menuHeight = 220;
  if (px + menuWidth > window.innerWidth) px = window.innerWidth - menuWidth - 8;
  if (py + menuHeight > window.innerHeight) py = window.innerHeight - menuHeight - 8;
  if (px < 0) px = 0;
  if (py < 0) py = 0;
  popupEl.style.left = `${px}px`;
  popupEl.style.top = `${py}px`;

  popupKeyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") destroySizePopup();
  };
  document.addEventListener("keydown", popupKeyHandler);

  popupOverlay.addEventListener("mousedown", () => destroySizePopup());
  closeBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroySizePopup();
  });
  cancelBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroySizePopup();
  });

  applyBtn.addEventListener("mousedown", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newSize = parseFloat(numberInput.value);
    if (isNaN(newSize) || newSize < 0.1 || newSize > 100.0) return;
    const clamped = clampSize(newSize);
    await api.updateNode({ id: node.id, node_size: clamped });
    destroySizePopup();
  });

  popupEl.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  slider.focus();
}

/* ─── Query overlay ─── */

function destroyQueryOverlay(): void {
  if (queryKeyHandler) {
    document.removeEventListener("keydown", queryKeyHandler);
    queryKeyHandler = null;
  }
  if (queryEl) {
    queryEl.remove();
    queryEl = null;
  }
}

function openQueryOverlay(): void {
  destroySizePopup();
  destroyQueryOverlay();

  queryEl = document.createElement("div");
  queryEl.className = "node-size-query-overlay";

  queryEl.innerHTML = `
    <div class="node-size-query-panel">
      <div class="node-size-query-header">
        <h3>Query Nodes by Size</h3>
        <button class="node-size-query-close">&times;</button>
      </div>
      <div class="node-size-query-body">
        <div class="node-size-query-row">
          <div class="node-size-query-field">
            <label>Min Size</label>
            <input type="number" class="q-min" value="0.1" min="0.1" max="100.0" step="0.1" />
          </div>
          <div class="node-size-query-field">
            <label>Max Size</label>
            <input type="number" class="q-max" value="100.0" min="0.1" max="100.0" step="0.1" />
          </div>
        </div>
        <div class="node-size-query-results" style="display:none"></div>
      </div>
      <div class="node-size-query-actions">
        <button class="btn btn-secondary q-cancel">Cancel</button>
        <button class="btn btn-primary q-search">Search</button>
      </div>
    </div>
  `;

  document.body.appendChild(queryEl);

  const closeBtn = queryEl.querySelector(".node-size-query-close");
  const cancelBtn = queryEl.querySelector(".q-cancel");
  const searchBtn = queryEl.querySelector(".q-search") as HTMLButtonElement;
  const minInput = queryEl.querySelector(".q-min") as HTMLInputElement;
  const maxInput = queryEl.querySelector(".q-max") as HTMLInputElement;
  const resultsEl = queryEl.querySelector(".node-size-query-results") as HTMLDivElement;

  queryKeyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") destroyQueryOverlay();
  };
  document.addEventListener("keydown", queryKeyHandler);

  queryEl.addEventListener("mousedown", (e) => {
    if (e.target === queryEl) destroyQueryOverlay();
  });

  closeBtn?.addEventListener("mousedown", () => destroyQueryOverlay());
  cancelBtn?.addEventListener("mousedown", () => destroyQueryOverlay());

  searchBtn.addEventListener("mousedown", async () => {
    const minSize = parseFloat(minInput.value);
    const maxSize = parseFloat(maxInput.value);

    if (isNaN(minSize) || isNaN(maxSize) || minSize > maxSize) {
      resultsEl.style.display = "block";
      resultsEl.innerHTML = `<div class="node-size-query-empty">Min size must be <= max size.</div>`;
      return;
    }

    searchBtn.textContent = "Searching...";
    searchBtn.disabled = true;

    const res = await api.queryNodesBySize({
      min_size: Math.max(0.1, minSize),
      max_size: Math.min(100.0, maxSize),
      limit: 100,
    });

    searchBtn.textContent = "Search";
    searchBtn.disabled = false;

    if (!res.success || !res.data) {
      resultsEl.style.display = "block";
      resultsEl.innerHTML = `<div class="node-size-query-empty">${res.error || "Query failed."}</div>`;
      return;
    }

    const nodes = res.data;
    if (nodes.length === 0) {
      resultsEl.style.display = "block";
      resultsEl.innerHTML = `<div class="node-size-query-empty">No nodes found in this range.</div>`;
      return;
    }

    resultsEl.style.display = "block";
    resultsEl.innerHTML = nodes
      .map(
        (n) => `
        <div class="node-size-query-result" data-id="${n.id}">
          <span class="node-size-query-result-content">${escapeHtml(n.content || "(empty)")}</span>
          <span class="node-size-query-result-badge">${n.node_size.toFixed(1)}</span>
        </div>`
      )
      .join("");

    resultsEl.querySelectorAll(".node-size-query-result").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const id = (item as HTMLElement).dataset.id;
        if (id) {
          destroyQueryOverlay();
          store.zoomIn(id);
        }
      });
    });
  });

  minInput.focus();
}

/* ─── Plugin ─── */

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    injectCSS();

    await ctx.emit("context-menu:register", {
      id: "adjust-node-size",
      pluginId: manifest.id,
      label: "Adjust Node Size",
      dividerBefore: true,
      execute: async (nodeId: string) => {
        const res = await api.getNode(nodeId);
        if (!res.success || !res.data) return;
        openSizePopup(
          res.data,
          window.innerWidth / 2 - 150,
          window.innerHeight / 2 - 110,
        );
      },
    });

    ctx.registerCommand({
      id: "query-nodes-by-size",
      name: "Query Nodes by Size",
      category: "Data",
      keywords: ["size", "query", "filter", "range"],
      execute: () => openQueryOverlay(),
    });

    console.log("[core-node-size] renderer ready");
  },

  async onUnload() {
    destroySizePopup();
    destroyQueryOverlay();
    removeCSS();

    if (ctxRef) {
      await ctxRef.emit("context-menu:unregister", {
        pluginId: manifest.id,
        id: "adjust-node-size",
      });
      ctxRef.unregisterAllCommands();
    }

    ctxRef = null;
  },
};

export default plugin;
