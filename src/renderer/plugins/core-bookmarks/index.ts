import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

let panel: HTMLDivElement | null = null;
let bookmarkNodeIds = new Set<string>();
let unsubStore: (() => void) | null = null;
let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;
let unsubBookmarkChanged: (() => void) | null = null;

async function refreshBookmarks(): Promise<void> {
  if (!panel) return;
  const res = await api.getBookmarks();
  if (!res.success || !res.data) return;

  bookmarkNodeIds = new Set(res.data.map((b: { node_id: string }) => b.node_id));

  if (res.data.length === 0) {
    panel.innerHTML = `
      <div class="bookmarks-empty">
        <p>No bookmarked nodes.</p>
        <p class="bookmarks-empty-hint">Focus a node, then run <kbd>Pin to Bookmarks</kbd> from the command palette.</p>
      </div>
    `;
    return;
  }

  let html = '<div class="bookmarks-list">';
  for (const bm of res.data) {
    const contentText = bm.node_content || "(empty)";
    const truncated = contentText.length > 80 ? contentText.slice(0, 80) + "\u2026" : contentText;
    const isDeleted = bm.node_content === "(deleted)";

    html += `
      <div class="bookmark-item ${isDeleted ? "deleted" : ""}" data-node-id="${escapeAttr(bm.node_id)}">
        <span class="bookmark-content">${escapeHtml(truncated)}</span>
        <span class="bookmark-click-count" title="Clicked ${bm.click_count} time(s)">${bm.click_count}</span>
        <button class="bookmark-unpin" title="Unpin" data-node-id="${escapeAttr(bm.node_id)}">&times;</button>
      </div>
    `;
  }
  html += "</div>";
  panel.innerHTML = html;

  // Event delegation for click and unpin
  panel.querySelectorAll(".bookmark-item").forEach((item) => {
    const el = item as HTMLElement;
    const nodeId = el.dataset.nodeId;
    if (!nodeId) return;

    el.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".bookmark-unpin")) return; // handled by unpin handler
      void api.incrementBookmarkClick({ nodeId });
      void store.zoomIn(nodeId);
    });
  });

  panel.querySelectorAll(".bookmark-unpin").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const nodeId = (btn as HTMLElement).dataset.nodeId;
      if (!nodeId) return;
      await api.unpinBookmark({ nodeId });
      bookmarkNodeIds.delete(nodeId);
      await refreshBookmarks();
    });
  });
}

async function togglePin(nodeId: string): Promise<void> {
  if (bookmarkNodeIds.has(nodeId)) {
    await api.unpinBookmark({ nodeId });
    bookmarkNodeIds.delete(nodeId);
  } else {
    await api.pinBookmark({ nodeId });
    bookmarkNodeIds.add(nodeId);
  }
  await refreshBookmarks();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;

    // Fetch initial bookmark state
    const res = await api.getBookmarks();
    if (res.success && res.data) {
      bookmarkNodeIds = new Set(res.data.map((b: { node_id: string }) => b.node_id));
    }

    // Create tab panel
    panel = document.createElement("div");
    panel.className = "sidebar-tab-panel bookmarks-tab";

    // Inject CSS
    styleEl = document.createElement("style");
    styleEl.textContent = `
      .bookmarks-tab {
        padding: 8px 12px;
        overflow-y: auto;
      }

      .bookmarks-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .bookmark-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.1s;
      }

      .bookmark-item:hover {
        background: var(--focus-bg, rgba(100, 149, 237, 0.12));
      }

      .bookmark-item.deleted {
        opacity: 0.5;
        cursor: default;
      }

      .bookmark-content {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text, #e0e0e0);
        font-size: 13px;
      }

      .bookmark-click-count {
        flex-shrink: 0;
        background: var(--bg, #1a1a2e);
        color: var(--text-muted, #888);
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 10px;
        min-width: 20px;
        text-align: center;
      }

      .bookmark-unpin {
        flex-shrink: 0;
        background: none;
        border: none;
        color: var(--text-muted, #888);
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 3px;
        opacity: 0;
        transition: opacity 0.1s, color 0.1s;
      }

      .bookmark-item:hover .bookmark-unpin {
        opacity: 1;
      }

      .bookmark-unpin:hover {
        color: #e06c75;
        background: rgba(224, 108, 117, 0.15);
      }

      .bookmarks-empty {
        color: var(--text-muted, #888);
        text-align: center;
        padding: 24px 12px;
        font-size: 13px;
      }

      .bookmarks-empty-hint {
        font-size: 12px;
        margin-top: 8px;
      }

      .bookmarks-empty kbd {
        background: var(--bg, #1a1a2e);
        padding: 1px 6px;
        border-radius: 4px;
        border: 1px solid var(--border, #333);
        font-family: var(--font-mono, monospace);
        font-size: 11px;
      }
    `;
    document.head.appendChild(styleEl);

    // Initial render
    await refreshBookmarks();

    // Register tab on sidebar
    await ctx.emit("sidebar:register-tab", {
      pluginId: "core-bookmarks",
      tabId: "bookmarks",
      label: "\u2605 Bookmarks",
      panel,
    });

    // Store subscription: refresh badges when tree changes
    unsubStore = store.subscribe(() => {
      // Keep bookmarks in sync — re-fetch when tree changes (node delete, etc.)
      // Debounced by the store's own batching
    });

    // Register commands
    ctx.registerCommand({
      id: "pin-bookmark",
      name: "Pin to Bookmarks",
      keywords: ["pin", "bookmark", "star", "save", "favorite"],
      execute: async () => {
        const nodeId = store.getState().focusedNodeId;
        if (!nodeId) return;
        await api.pinBookmark({ nodeId });
        bookmarkNodeIds.add(nodeId);
        await refreshBookmarks();
        await ctx.emit("sidebar:show-tab", { tabId: "bookmarks" });
      },
    });

    ctx.registerCommand({
      id: "unpin-bookmark",
      name: "Unpin from Bookmarks",
      keywords: ["unpin", "bookmark", "unstar", "unsave", "unfavorite"],
      execute: async () => {
        const nodeId = store.getState().focusedNodeId;
        if (!nodeId) return;
        await api.unpinBookmark({ nodeId });
        bookmarkNodeIds.delete(nodeId);
        await refreshBookmarks();
      },
    });

    // Listen for bookmark changes from other sources
    unsubBookmarkChanged = ctx.on("bookmark:changed", () => {
      void refreshBookmarks();
    });

    // Register context menu items
    await ctx.emit("context-menu:register", {
      id: "bookmark-pin",
      pluginId: "core-bookmarks",
      label: "\u2605 Pin to Bookmarks",
      dividerBefore: true,
      execute: async (nodeId: string) => {
        await api.pinBookmark({ nodeId });
        bookmarkNodeIds.add(nodeId);
        await refreshBookmarks();
      },
    });

    await ctx.emit("context-menu:register", {
      id: "bookmark-unpin",
      pluginId: "core-bookmarks",
      label: "\u2715 Unpin from Bookmarks",
      execute: async (nodeId: string) => {
        await api.unpinBookmark({ nodeId });
        bookmarkNodeIds.delete(nodeId);
        await refreshBookmarks();
      },
    });
  },

  async onUnload() {
    await ctxRef?.emit("context-menu:unregister", { pluginId: "core-bookmarks", id: "bookmark-pin" });
    await ctxRef?.emit("context-menu:unregister", { pluginId: "core-bookmarks", id: "bookmark-unpin" });

    await ctxRef?.emit("sidebar:unregister-tab", {
      pluginId: "core-bookmarks",
      tabId: "bookmarks",
    });
    unsubStore?.();
    unsubStore = null;
    unsubBookmarkChanged?.();
    unsubBookmarkChanged = null;
    panel?.remove();
    panel = null;
    bookmarkNodeIds.clear();
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
    ctxRef = null;
  },
};

export default plugin;
