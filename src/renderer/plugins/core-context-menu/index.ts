import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";

interface ContextMenuItem {
  id: string;
  pluginId: string;
  label: string;
  shortcut?: string;
  dividerBefore?: boolean;
  execute: (nodeId: string) => void | Promise<void>;
}

let styleEl: HTMLStyleElement | null = null;
let menuEl: HTMLDivElement | null = null;
let items: ContextMenuItem[] = [];
let unsubRegister: (() => void) | null = null;
let unsubUnregister: (() => void) | null = null;

function showCopyToast(message: string): void {
  const el = document.createElement("div");
  el.className = "copy-toast";
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2000);
}

function destroyMenu(): void {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}

function showMenu(x: number, y: number, nodeId: string): void {
  destroyMenu();

  if (items.length === 0) return;

  menuEl = document.createElement("div");
  menuEl.className = "context-menu";

  let html = "";
  for (const item of items) {
    if (item.dividerBefore) {
      html += '<div class="context-menu-divider"></div>';
    }
    const shortcutHtml = item.shortcut
      ? ` <kbd>${item.shortcut}</kbd>`
      : "";
    html += `<div class="context-menu-item" data-action="${item.id}">${item.label}${shortcutHtml}</div>`;
  }

  menuEl.innerHTML = html;

  // Append first so offsetHeight reflects actual constrained height
  document.body.appendChild(menuEl);

  // Position - clamp to viewport (max-height CSS handles overflow)
  const menuWidth = menuEl.offsetWidth;
  const menuHeight = menuEl.offsetHeight;
  let px = Math.max(0, x);
  let py = Math.max(0, y);
  if (px + menuWidth > window.innerWidth) px = window.innerWidth - menuWidth - 8;
  if (py + menuHeight > window.innerHeight) py = window.innerHeight - menuHeight - 8;
  if (px < 0) px = 0;
  if (py < 0) py = 0;
  menuEl.style.left = `${px}px`;
  menuEl.style.top = `${py}px`;

  // Click actions
  menuEl.querySelectorAll(".context-menu-item").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = (el as HTMLElement).dataset.action;
      const item = items.find((i) => i.id === action);
      if (item) {
        void item.execute(nodeId);
      }
      destroyMenu();
    });
  });

  // Dismiss on click outside or Escape
  const dismiss = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== "Escape") return;
    if (e instanceof MouseEvent && menuEl?.contains(e.target as Node)) return;
    destroyMenu();
    document.removeEventListener("mousedown", dismiss, true);
    document.removeEventListener("keydown", dismiss);
  };
  document.addEventListener("mousedown", dismiss, true);
  document.addEventListener("keydown", dismiss);
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    // Inject CSS
    styleEl = document.createElement("style");
    styleEl.textContent = `
      .context-menu {
        position: fixed;
        z-index: 2000;
        background: var(--bg-secondary, #16213e);
        border: 1px solid var(--border, #333);
        border-radius: 8px;
        padding: 4px 0;
        min-width: 220px;
        max-height: calc(100vh - 24px);
        overflow-y: auto;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      }

      .context-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text, #e0e0e0);
        transition: background 0.1s;
      }

      .context-menu-item:hover {
        background: var(--focus-bg, rgba(255,255,255,0.05));
      }

      .context-menu-item kbd {
        margin-left: auto;
        font-size: 11px;
        color: var(--text-muted, #888);
        font-family: var(--font-mono, monospace);
      }

      .context-menu-divider {
        height: 1px;
        background: var(--border, #333);
        margin: 4px 0;
      }
    `;
    document.head.appendChild(styleEl);

    // Built-in default item: Copy block reference
    items.push({
      id: "copy-ref",
      pluginId: "core-context-menu",
      label: "Copy block reference ((id))",
      shortcut: "Ctrl+Shift+C",
      execute: (nodeId: string) => {
        void navigator.clipboard.writeText(`((${nodeId}))`).then(() => {
          showCopyToast("Copied block reference");
        });
      },
    });

    // Listen for item registrations from other plugins
    unsubRegister = ctx.on("context-menu:register", (payload: unknown) => {
      const def = payload as ContextMenuItem;
      // Replace existing item with same id from same plugin
      items = items.filter((i) => !(i.id === def.id && i.pluginId === def.pluginId));
      items.push(def);
    });

    unsubUnregister = ctx.on("context-menu:unregister", (payload: unknown) => {
      const { pluginId, id } = payload as { pluginId: string; id: string };
      items = items.filter((i) => !(i.id === id && i.pluginId === pluginId));
    });

    // Intercept right-click on bullets (capture phase — fires before component-level handlers)
    document.addEventListener(
      "contextmenu",
      (e) => {
        const bullet = (e.target as HTMLElement).closest(".bullet") as HTMLElement | null;
        if (!bullet) return;
        const nodeEl = bullet.closest(".outline-node") as HTMLElement | null;
        if (!nodeEl) return;
        const nodeId = nodeEl.dataset.nodeId;
        if (!nodeId) return;

        e.preventDefault();
        e.stopPropagation();
        showMenu(e.clientX, e.clientY, nodeId);
      },
      true
    );
  },

  async onUnload() {
    unsubRegister?.();
    unsubUnregister?.();
    destroyMenu();
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
    items = [];
  },
};

export default plugin;
