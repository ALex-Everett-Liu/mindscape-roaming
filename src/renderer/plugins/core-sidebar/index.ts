import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";

interface TabEntry {
  pluginId: string;
  tabId: string;
  label: string;
  panel: HTMLElement;
}

const SIDEBAR_WIDTH_KEY = "mindscape_sidebar_width";
const SIDEBAR_OPEN_KEY = "mindscape_sidebar_open";
const SIDEBAR_ACTIVE_TAB_KEY = "mindscape_sidebar_active_tab";

let styleEl: HTMLStyleElement | null = null;
let sidebar: HTMLDivElement | null = null;
let resizeHandle: HTMLDivElement | null = null;
let tabBar: HTMLDivElement | null = null;
let bodyEl: HTMLDivElement | null = null;
let open = false;
let width = 320;
let tabs: TabEntry[] = [];
let activeTabId: string | null = null;
let observer: MutationObserver | null = null;
let unsubTabRegister: (() => void) | null = null;
let unsubTabUnregister: (() => void) | null = null;
let unsubToggle: (() => void) | null = null;
let unsubShowTab: (() => void) | null = null;

function loadPrefs(): void {
  try {
    open = localStorage.getItem(SIDEBAR_OPEN_KEY) === "1";
    const w = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (w) {
      const n = parseInt(w, 10);
      if (n >= 200 && n <= 600) width = n;
    }
    activeTabId = localStorage.getItem(SIDEBAR_ACTIVE_TAB_KEY);
  } catch { /* ignore */ }
}

function savePrefs(): void {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, open ? "1" : "0");
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    if (activeTabId) localStorage.setItem(SIDEBAR_ACTIVE_TAB_KEY, activeTabId);
  } catch { /* ignore */ }
}

function updateTop(): void {
  if (!sidebar) return;
  const toolbar = document.querySelector<HTMLElement>(".toolbar");
  const breadcrumb = document.querySelector<HTMLElement>(".breadcrumb-container");
  const top = (toolbar?.offsetHeight || 0) + ((breadcrumb?.offsetHeight || 0) + 1);
  sidebar.style.top = `${top}px`;
}

function applyContentPush(push: boolean): void {
  const tree = document.querySelector(".outline-tree");
  const search = document.querySelector(".search-results");
  if (push) {
    tree?.classList.add("sidebar-active");
    search?.classList.add("sidebar-active");
  } else {
    tree?.classList.remove("sidebar-active");
    search?.classList.remove("sidebar-active");
  }
}

function setSidebarOpen(shouldOpen: boolean): void {
  open = shouldOpen;
  savePrefs();
  if (!sidebar) return;

  if (open) {
    sidebar.classList.add("open");
    applyContentPush(true);
    updateTop();
    renderTabContent();
  } else {
    sidebar.classList.remove("open");
    applyContentPush(false);
  }
}

function renderSidebarTabs(): void {
  if (!tabBar || !sidebar) return;

  // Show tab bar only when 2+ tabs
  if (tabs.length < 2) {
    tabBar.style.display = "none";
    return;
  }

  tabBar.style.display = "flex";
  tabBar.innerHTML = "";

  for (const tab of tabs) {
    const btn = document.createElement("button");
    btn.className = "sidebar-tab-btn";
    if (tab.tabId === activeTabId) btn.classList.add("active");
    btn.textContent = tab.label;
    btn.title = tab.label;
    btn.addEventListener("click", () => {
      setActiveTab(tab.tabId);
    });
    tabBar.appendChild(btn);
  }
}

function setActiveTab(tabId: string): void {
  if (activeTabId === tabId) return;
  activeTabId = tabId;
  savePrefs();
  renderSidebarTabs();
  renderTabContent();
  if (!open) setSidebarOpen(true);
}

function renderTabContent(): void {
  if (!bodyEl) return;

  // Hide all panels
  for (const tab of tabs) {
    tab.panel.style.display = "none";
  }

  // Show active
  const active = tabs.find((t) => t.tabId === activeTabId);
  if (active) {
    active.panel.style.display = "";
  }
}

function refreshUI(): void {
  if (!sidebar) return;

  // If no tabs, hide sidebar
  if (tabs.length === 0) {
    setSidebarOpen(false);
    sidebar.style.display = "none";
    return;
  }

  sidebar.style.display = "flex";

  // Ensure active tab is valid
  if (!tabs.find((t) => t.tabId === activeTabId)) {
    activeTabId = tabs[0]?.tabId ?? null;
    savePrefs();
  }

  renderSidebarTabs();
  renderTabContent();
}

function registerTab(pluginId: string, tabId: string, label: string, panel: HTMLElement): void {
  // Remove existing tab from same plugin (in case of reload)
  tabs = tabs.filter((t) => !(t.pluginId === pluginId && t.tabId === tabId));

  panel.style.display = "none";
  tabs.push({ pluginId, tabId, label, panel });
  bodyEl?.appendChild(panel);

  if (tabs.length === 1) {
    activeTabId = tabId;
  }

  refreshUI();

  // Restore open state if previously open
  if (open && !sidebar?.classList.contains("open")) {
    setSidebarOpen(true);
  }
}

function unregisterTab(pluginId: string, tabId: string): void {
  const idx = tabs.findIndex((t) => t.pluginId === pluginId && t.tabId === tabId);
  if (idx === -1) return;

  const entry = tabs[idx];
  entry.panel.remove();
  tabs.splice(idx, 1);

  if (activeTabId === tabId) {
    activeTabId = tabs[0]?.tabId ?? null;
    savePrefs();
  }

  refreshUI();
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    loadPrefs();

    // Inject CSS
    styleEl = document.createElement("style");
    styleEl.textContent = `
      :root {
        --sidebar-width: ${width}px;
      }

      .sidebar {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: var(--sidebar-width);
        background: var(--bg-secondary, #16213e);
        border-left: 1px solid var(--border, #333);
        z-index: 40;
        display: flex;
        flex-direction: column;
        font-size: 13px;
        transform: translateX(100%);
        transition: transform 0.2s ease;
        box-shadow: -2px 0 12px rgba(0,0,0,0.2);
      }

      .sidebar.open {
        transform: translateX(0);
      }

      .sidebar-tab-bar {
        display: flex;
        flex-shrink: 0;
        border-bottom: 1px solid var(--border, #333);
        background: var(--bg-primary, #0f1a2e);
        overflow-x: auto;
      }

      .sidebar-tab-btn {
        flex: 1;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: var(--text-muted, #888);
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
        white-space: nowrap;
        border-bottom: 2px solid transparent;
        transition: color 0.15s, border-color 0.15s;
      }

      .sidebar-tab-btn:hover {
        color: var(--text-primary, #ddd);
      }

      .sidebar-tab-btn.active {
        color: var(--accent, #4fc3f7);
        border-bottom-color: var(--accent, #4fc3f7);
      }

      .sidebar-resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 5px;
        cursor: col-resize;
        z-index: 10;
        background: transparent;
        transition: background 0.15s;
      }

      .sidebar-resize-handle:hover,
      .sidebar.resizing .sidebar-resize-handle {
        background: var(--accent, #4fc3f7);
        opacity: 0.6;
      }

      .sidebar-body {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }

      .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border, #333);
        flex-shrink: 0;
      }

      .sidebar-title {
        font-weight: 600;
        font-size: 13px;
        color: var(--text-primary, #ddd);
      }

      .sidebar-close {
        background: none;
        border: none;
        color: var(--text-muted, #888);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 4px;
      }

      .sidebar-close:hover {
        color: var(--text-primary, #ddd);
        background: var(--bg-primary, #0f1a2e);
      }

      .outline-tree.sidebar-active,
      .search-results.sidebar-active {
        margin-right: var(--sidebar-width);
        transition: margin-right 0.2s ease;
      }
    `;
    document.head.appendChild(styleEl);

    // Create sidebar DOM
    sidebar = document.createElement("div");
    sidebar.className = "sidebar";

    resizeHandle = document.createElement("div");
    resizeHandle.className = "sidebar-resize-handle";
    sidebar.appendChild(resizeHandle);

    // Header
    const header = document.createElement("div");
    header.className = "sidebar-header";

    const title = document.createElement("span");
    title.className = "sidebar-title";
    title.textContent = "Sidebar";
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sidebar-close";
    closeBtn.textContent = "\u00D7";
    closeBtn.title = "Close sidebar";
    closeBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      setSidebarOpen(false);
    });
    header.appendChild(closeBtn);

    sidebar.appendChild(header);

    // Tab bar
    tabBar = document.createElement("div");
    tabBar.className = "sidebar-tab-bar";
    tabBar.style.display = "none";
    sidebar.appendChild(tabBar);

    // Body
    bodyEl = document.createElement("div");
    bodyEl.className = "sidebar-body";
    sidebar.appendChild(bodyEl);

    // Resize logic
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startWidth = width;
      sidebar!.classList.add("resizing");
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const delta = startX - e.clientX;
      const newWidth = Math.min(600, Math.max(200, startWidth + delta));
      width = newWidth;
      document.documentElement.style.setProperty("--sidebar-width", `${newWidth}px`);
    });

    document.addEventListener("mouseup", () => {
      if (dragging) {
        dragging = false;
        sidebar!.classList.remove("resizing");
        savePrefs();
      }
    });

    document.body.appendChild(sidebar);
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);

    // Position observer
    observer = new MutationObserver(() => {
      if (open) updateTop();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    updateTop();

    // Listen for tab registrations from other plugins
    unsubTabRegister = ctx.on("sidebar:register-tab", (payload: unknown) => {
      const p = payload as { pluginId: string; tabId: string; label: string; panel: HTMLElement };
      registerTab(p.pluginId, p.tabId, p.label, p.panel);
    });

    unsubTabUnregister = ctx.on("sidebar:unregister-tab", (payload: unknown) => {
      const p = payload as { pluginId: string; tabId: string };
      unregisterTab(p.pluginId, p.tabId);
    });

    unsubToggle = ctx.on("sidebar:toggle", () => {
      setSidebarOpen(!open);
    });

    unsubShowTab = ctx.on("sidebar:show-tab", (payload: unknown) => {
      const p = payload as { tabId: string };
      setActiveTab(p.tabId);
    });

    // Register commands
    ctx.registerCommand({
      id: "sidebar-toggle",
      name: "Toggle Sidebar",
      keywords: ["sidebar", "panel", "toggle"],
      execute: () => setSidebarOpen(!open),
    });

    // Restore open state
    if (open && tabs.length > 0) {
      setSidebarOpen(true);
    }
  },

  async onUnload() {
    unsubTabRegister?.();
    unsubTabUnregister?.();
    unsubToggle?.();
    unsubShowTab?.();
    observer?.disconnect();
    observer = null;
    if (sidebar) {
      sidebar.remove();
      sidebar = null;
    }
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
    tabs = [];
    activeTabId = null;
    resizeHandle = null;
    tabBar = null;
    bodyEl = null;
  },
};

export default plugin;
