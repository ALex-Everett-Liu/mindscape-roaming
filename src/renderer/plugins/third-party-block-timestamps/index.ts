import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { api } from "../../rpc/api";

const CSS = `
.block-info-overlay {
  position: fixed;
  inset: 0;
  z-index: 1002;
}
.block-info-popup {
  position: fixed;
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border, #333);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  min-width: 260px;
  max-width: 360px;
  font-size: 13px;
  z-index: 1003;
  overflow: hidden;
}
.block-info-popup-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, #333);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.block-info-popup-title {
  font-weight: 600;
  color: var(--text, #e0e0e0);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.block-info-popup-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
  flex-shrink: 0;
}
.block-info-popup-close:hover {
  color: var(--text, #e0e0e0);
}
.block-info-popup-body {
  padding: 12px 14px;
}
.block-info-content-preview {
  color: var(--text, #e0e0e0);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: var(--bg, #1a1a2e);
  border-radius: 6px;
  border-left: 3px solid var(--accent, #4fc3f7);
  word-break: break-word;
  max-height: 80px;
  overflow-y: auto;
}
.block-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
}
.block-info-label {
  color: var(--text-muted, #888);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  width: 55px;
  flex-shrink: 0;
}
.block-info-value {
  color: var(--text, #e0e0e0);
  font-size: 13px;
  font-family: var(--mono, "Cascadia Code", "Fira Code", monospace);
}
.block-info-id {
  color: var(--text-muted, #888);
  font-size: 11px;
  word-break: break-all;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border, #333);
}
`;

let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;
let popupEl: HTMLElement | null = null;
let popupOverlay: HTMLElement | null = null;
let popupKeyHandler: ((e: KeyboardEvent) => void) | null = null;

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

function formatTime(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${date} ${time}`;
}

function destroyPopup(): void {
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

async function showBlockInfo(nodeId: string, x: number, y: number): Promise<void> {
  destroyPopup();

  const res = await api.getNode(nodeId);
  if (!res.success || !res.data) {
    return;
  }

  const node = res.data;
  const preview =
    node.content.trim().length > 0
      ? node.content.trim().slice(0, 200)
      : "(empty)";

  popupEl = document.createElement("div");
  popupEl.className = "block-info-popup";
  popupEl.innerHTML = `
    <div class="block-info-popup-header">
      <span class="block-info-popup-title">Block Info</span>
      <button class="block-info-popup-close">&times;</button>
    </div>
    <div class="block-info-popup-body">
      <div class="block-info-content-preview">${escapeHtml(preview)}</div>
      <div class="block-info-row">
        <span class="block-info-label">Created</span>
        <span class="block-info-value">${formatTime(node.created_at)}</span>
      </div>
      <div class="block-info-row">
        <span class="block-info-label">Updated</span>
        <span class="block-info-value">${formatTime(node.updated_at)}</span>
      </div>
      <div class="block-info-id">${node.id}</div>
    </div>
  `;

  // Position the popup near the click, clamped to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  document.body.appendChild(popupEl);

  const popupW = popupEl.offsetWidth;
  const popupH = popupEl.offsetHeight;

  let left = x + 8;
  let top = y - 8;

  if (left + popupW > vw - 8) left = x - popupW - 8;
  if (top + popupH > vh - 8) top = vh - popupH - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;

  // Close button
  popupEl.querySelector(".block-info-popup-close")?.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroyPopup();
  });

  // Overlay for click-outside
  const overlay = document.createElement("div");
  overlay.className = "block-info-overlay";
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      destroyPopup();
    }
  });
  document.body.appendChild(overlay);
  popupOverlay = overlay;

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      destroyPopup();
    }
  };
  document.addEventListener("keydown", onKey);
  popupKeyHandler = onKey;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    injectCSS();

    await ctx.emit("context-menu:register", {
      id: "show-block-info",
      pluginId: manifest.id,
      label: "Show Block Info",
      dividerBefore: true,
      execute: (nodeId: string) => {
        void showBlockInfo(
          nodeId,
          window.innerWidth / 2 - 130,
          window.innerHeight / 2 - 80,
        );
      },
    });

    console.log("[third-party-block-timestamps] renderer ready");
  },

  async onUnload() {
    destroyPopup();

    if (ctxRef) {
      await ctxRef.emit("context-menu:unregister", {
        pluginId: manifest.id,
        id: "show-block-info",
      });
      ctxRef.unregisterAllCommands();
      ctxRef = null;
    }

    removeCSS();
  },
};

export default plugin;
