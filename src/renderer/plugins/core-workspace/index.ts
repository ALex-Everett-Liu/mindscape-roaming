import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

interface WorkspaceEntry {
  nodeId: string;
  content: string;
}

let panel: HTMLDivElement | null = null;
let pinnedIds = new Set<string>();
let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;

async function refreshWorkspace(): Promise<void> {
  if (!panel) return;

  if (pinnedIds.size === 0) {
    panel.innerHTML = `
      <div class="workspace-empty">
        <p>No nodes pinned to workspace.</p>
        <p class="workspace-empty-hint">Right-click a bullet and choose <kbd>★ Pin to Workspace</kbd>, or use the command palette.</p>
      </div>
    `;
    return;
  }

  const entries: WorkspaceEntry[] = [];
  for (const nodeId of pinnedIds) {
    const res = await api.getNode(nodeId);
    const content = res.success && res.data ? res.data.content : "(deleted)";
    entries.push({ nodeId, content: content || "(empty)" });
  }

  let html = '<div class="workspace-list">';
  for (const entry of entries) {
    const truncated = entry.content.length > 80 ? entry.content.slice(0, 80) + "\u2026" : entry.content;
    const isDeleted = entry.content === "(deleted)";

    html += `
      <div class="workspace-item ${isDeleted ? "deleted" : ""}" data-node-id="${escapeAttr(entry.nodeId)}">
        <span class="workspace-content">${escapeHtml(truncated)}</span>
        <button class="workspace-unpin" title="Unpin" data-node-id="${escapeAttr(entry.nodeId)}">&times;</button>
      </div>
    `;
  }
  html += "</div>";
  panel.innerHTML = html;

  panel.querySelectorAll(".workspace-item").forEach((item) => {
    const el = item as HTMLElement;
    const nodeId = el.dataset.nodeId;
    if (!nodeId) return;

    el.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest(".workspace-unpin")) return;
      void store.zoomIn(nodeId);
    });
  });

  panel.querySelectorAll(".workspace-unpin").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nodeId = (btn as HTMLElement).dataset.nodeId;
      if (!nodeId) return;
      pinnedIds.delete(nodeId);
      void refreshWorkspace();
    });
  });
}

function pinNode(nodeId: string): void {
  pinnedIds.add(nodeId);
}

function unpinNode(nodeId: string): void {
  pinnedIds.delete(nodeId);
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

    panel = document.createElement("div");
    panel.className = "sidebar-tab-panel workspace-tab";

    styleEl = document.createElement("style");
    styleEl.textContent = `
      .workspace-tab {
        padding: 8px 12px;
      }

      .workspace-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .workspace-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.1s;
      }

      .workspace-item:hover {
        background: var(--focus-bg, rgba(100, 149, 237, 0.12));
      }

      .workspace-item.deleted {
        opacity: 0.5;
        cursor: default;
      }

      .workspace-content {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--text, #e0e0e0);
        font-size: 13px;
      }

      .workspace-unpin {
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

      .workspace-item:hover .workspace-unpin {
        opacity: 1;
      }

      .workspace-unpin:hover {
        color: #e06c75;
        background: rgba(224, 108, 117, 0.15);
      }

      .workspace-empty {
        color: var(--text-muted, #888);
        text-align: center;
        padding: 24px 12px;
        font-size: 13px;
      }

      .workspace-empty-hint {
        font-size: 12px;
        margin-top: 8px;
      }

      .workspace-empty kbd {
        background: var(--bg, #1a1a2e);
        padding: 1px 6px;
        border-radius: 4px;
        border: 1px solid var(--border, #333);
        font-family: var(--font-mono, monospace);
        font-size: 11px;
      }
    `;
    document.head.appendChild(styleEl);

    await refreshWorkspace();

    await ctx.emit("sidebar:register-tab", {
      pluginId: "core-workspace",
      tabId: "workspace",
      label: "Workspace",
      panel,
    });

    // Register commands
    ctx.registerCommand({
      id: "pin-workspace",
      name: "Pin to Workspace",
      keywords: ["pin", "workspace", "temp", "temporary"],
      execute: async () => {
        const nodeId = store.getState().focusedNodeId;
        if (!nodeId) return;
        pinNode(nodeId);
        await refreshWorkspace();
        await ctx.emit("sidebar:show-tab", { tabId: "workspace" });
      },
    });

    ctx.registerCommand({
      id: "unpin-workspace",
      name: "Unpin from Workspace",
      keywords: ["unpin", "workspace", "temp", "temporary"],
      execute: async () => {
        const nodeId = store.getState().focusedNodeId;
        if (!nodeId) return;
        unpinNode(nodeId);
        await refreshWorkspace();
      },
    });

    ctx.registerCommand({
      id: "show-workspace",
      name: "Show Workspace",
      keywords: ["workspace", "sidebar", "show", "panel"],
      execute: () => {
        void ctx.emit("sidebar:show-tab", { tabId: "workspace" });
      },
    });

    // Register context menu items
    await ctx.emit("context-menu:register", {
      id: "workspace-pin",
      pluginId: "core-workspace",
      label: "\u2605 Pin to Workspace",
      dividerBefore: true,
      execute: (nodeId: string) => {
        pinNode(nodeId);
        void refreshWorkspace();
      },
    });

    await ctx.emit("context-menu:register", {
      id: "workspace-unpin",
      pluginId: "core-workspace",
      label: "\u2715 Unpin from Workspace",
      execute: (nodeId: string) => {
        unpinNode(nodeId);
        void refreshWorkspace();
      },
    });
  },

  async onUnload() {
    await ctxRef?.emit("context-menu:unregister", { pluginId: "core-workspace", id: "workspace-pin" });
    await ctxRef?.emit("context-menu:unregister", { pluginId: "core-workspace", id: "workspace-unpin" });

    await ctxRef?.emit("sidebar:unregister-tab", {
      pluginId: "core-workspace",
      tabId: "workspace",
    });

    panel?.remove();
    panel = null;
    pinnedIds.clear();
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
    ctxRef = null;
  },
};

export default plugin;
