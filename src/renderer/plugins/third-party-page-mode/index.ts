import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import type { OutlineNode } from "../../../shared/types";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

const BREADCRUMB_TRUNCATE_KEY = "mindscape_page_breadcrumb_truncate";
const EDITABLE_KEY = "mindscape_page_editable_nodes";
const BREADCRUMB_EDITABLE_KEY = "mindscape_page_breadcrumb_editable";

const PAGE_CSS = `
.outline-node[data-is-page]:not(.in-page) > .outline-tree {
  display: none !important;
}
.page-wikilink-wrapper {
  color: var(--accent, #4fc3f7);
  cursor: pointer;
  border-bottom: 1px dashed var(--accent, #4fc3f7);
  transition: background 0.15s;
  user-select: none;
}
.page-wikilink-wrapper:hover {
  background: rgba(79, 195, 247, 0.1);
}
.page-wikilink-wrapper::before {
  content: "[[";
  opacity: 0.7;
  font-weight: 600;
}
.page-wikilink-wrapper::after {
  content: "]]";
  opacity: 0.7;
  font-weight: 600;
}
.breadcrumb-item.page-scope-boundary {
  border-left: 2px solid var(--accent, #4fc3f7);
  padding-left: 8px;
  border-radius: 0;
}
.breadcrumb-scope-hidden {
  display: none !important;
}
.page-ancestors-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 17px;
  background: var(--bg, #1a1a2e);
  border-top: 1px solid var(--border, #333);
  z-index: 51;
  font-size: 13px;
  max-height: 200px;
  overflow-y: auto;
}
.page-ancestors-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--bg, #1a1a2e);
  border-bottom: 1px solid var(--border, #333);
  position: sticky;
  top: 0;
}
.page-ancestors-count {
  background: rgba(79, 195, 247, 0.2);
  color: var(--accent, #4fc3f7);
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}
.page-ancestors-label {
  color: var(--text-muted, #888);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}
.page-ancestors-list {
  padding: 4px 0;
}
.page-ancestor-item {
  padding: 6px 16px 6px 24px;
  color: var(--text, #e0e0e0);
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.1s;
  font-size: 13px;
  line-height: 1.4;
}
.page-ancestor-item:hover {
  background: var(--focus-bg, rgba(255,255,255,0.05));
  border-left-color: var(--accent, #4fc3f7);
}
.page-ancestor-content {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;

let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let unsubStore: (() => void) | null = null;
let lastZoomedId: string | null | undefined = undefined;
let pageIds: Set<string> = new Set();
let ancestorsPanel: HTMLDivElement | null = null;
let lastAncestorHTML = "";

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

/* ─── Page ID cache (synced from tree data) ─── */

function syncPageCacheFromStore(): void {
  const next = new Set<string>();
  const stack = [...store.getState().tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.is_page) next.add(node.id);
    stack.push(...node.children);
  }
  // Also check breadcrumbs (the zoomed page node itself lives in breadcrumbs, not tree)
  for (const crumb of store.getState().breadcrumbs) {
    if (crumb.is_page) next.add(crumb.id);
  }
  pageIds = next;
}

function isPage(id: string): boolean {
  return pageIds.has(id);
}

/* ─── Breadcrumb truncation ─── */

let breadcrumbTruncate = false;

function loadBreadcrumbPref(): void {
  try {
    breadcrumbTruncate = localStorage.getItem(BREADCRUMB_TRUNCATE_KEY) === "1";
  } catch {
    /* ignore */
  }
}

function saveBreadcrumbPref(): void {
  try {
    localStorage.setItem(BREADCRUMB_TRUNCATE_KEY, breadcrumbTruncate ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/* ─── Editable page nodes toggle ─── */

let editablePageNodes = false;

function loadEditablePref(): void {
  try {
    editablePageNodes = localStorage.getItem(EDITABLE_KEY) === "1";
  } catch {
    /* ignore */
  }
}

function saveEditablePref(): void {
  try {
    localStorage.setItem(EDITABLE_KEY, editablePageNodes ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/* ─── Breadcrumb editing toggle ─── */

let breadcrumbEditing = false;

function loadBreadcrumbEditablePref(): void {
  try {
    breadcrumbEditing = localStorage.getItem(BREADCRUMB_EDITABLE_KEY) === "1";
  } catch {
    /* ignore */
  }
}

function saveBreadcrumbEditablePref(): void {
  try {
    localStorage.setItem(BREADCRUMB_EDITABLE_KEY, breadcrumbEditing ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function findPageAncestorInBreadcrumbs(): OutlineNode | null {
  const breadcrumbs = store.getState().breadcrumbs;
  if (breadcrumbs.length === 0) return null;

  // Find the last (deepest) page node in the breadcrumbs
  for (let i = breadcrumbs.length - 1; i >= 0; i--) {
    if (breadcrumbs[i].is_page) {
      return breadcrumbs[i];
    }
  }
  return null;
}

function applyBreadcrumbTruncation(): void {
  const container = document.querySelector<HTMLElement>(".breadcrumb-container");
  if (!container) return;

  // Remove existing scope classes
  container.querySelectorAll(".breadcrumb-scope-hidden").forEach((el) => {
    el.classList.remove("breadcrumb-scope-hidden");
  });
  const existingBoundary = container.querySelector(".page-scope-boundary");
  if (existingBoundary) {
    existingBoundary.classList.remove("page-scope-boundary");
  }

  if (!breadcrumbTruncate) return;

  const pageAncestor = findPageAncestorInBreadcrumbs();
  if (!pageAncestor) return;

  // Find the boundary item in the DOM
  const boundaryEl = container.querySelector<HTMLElement>(
    `.breadcrumb-item[data-node-id="${pageAncestor.id}"]`
  );
  if (!boundaryEl) return;

  boundaryEl.classList.add("page-scope-boundary");

  // Hide all preceding elements (Home, separators, and ancestor breadcrumbs)
  let current: Element | null = container.firstElementChild;
  let boundaryReached = false;

  while (current) {
    if (current === boundaryEl) {
      boundaryReached = true;
    }
    if (!boundaryReached) {
      current.classList.add("breadcrumb-scope-hidden");
    }
    current = current.nextElementSibling;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function createAncestorsPanel(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "page-ancestors-panel";
  panel.style.display = "none";
  return panel;
}

function updateAncestorPanel(): void {
  if (!ancestorsPanel) return;

  if (!breadcrumbTruncate) {
    ancestorsPanel.style.display = "none";
    lastAncestorHTML = "";
    return;
  }

  const breadcrumbs = store.getState().breadcrumbs;
  if (breadcrumbs.length === 0) {
    ancestorsPanel.style.display = "none";
    lastAncestorHTML = "";
    return;
  }

  // Find the page ancestor in breadcrumbs
  let pageIndex = -1;
  for (let i = breadcrumbs.length - 1; i >= 0; i--) {
    if (breadcrumbs[i].is_page) {
      pageIndex = i;
      break;
    }
  }

  // No page ancestor found at all
  if (pageIndex < 0) {
    ancestorsPanel.style.display = "none";
    lastAncestorHTML = "";
    return;
  }

  // Root-level page: no hidden ancestors, but still need an exit hatch
  if (pageIndex === 0) {
    ancestorsPanel.style.display = "block";

    const backlinksPanel = document.querySelector<HTMLElement>(".backlinks-panel");
    if (backlinksPanel && backlinksPanel.style.display !== "none") {
      ancestorsPanel.style.bottom = `${backlinksPanel.offsetHeight}px`;
    } else {
      ancestorsPanel.style.bottom = "0";
    }

    const html = `
      <div class="page-ancestors-header">
        <span class="page-ancestors-count">0</span>
        <span class="page-ancestors-label">Ancestors above this page</span>
      </div>
      <div class="page-ancestors-list">
        <div class="page-ancestor-item" data-action="zoom-root">
          <span class="page-ancestor-content">Exit page — return to root view</span>
        </div>
      </div>
    `;

    if (html === lastAncestorHTML) return;
    lastAncestorHTML = html;
    ancestorsPanel.innerHTML = html;

    ancestorsPanel.querySelectorAll(".page-ancestor-item[data-action='zoom-root']").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void store.zoomToRoot();
      });
    });
    return;
  }

  // Ancestors above the page boundary (index 0 to pageIndex - 1)
  const hiddenAncestors = breadcrumbs.slice(0, pageIndex);
  const count = hiddenAncestors.length;

  // Offset bottom when backlinks panel is also visible
  const backlinksPanel = document.querySelector<HTMLElement>(".backlinks-panel");
  if (backlinksPanel && backlinksPanel.style.display !== "none") {
    ancestorsPanel.style.bottom = `${backlinksPanel.offsetHeight}px`;
  } else {
    ancestorsPanel.style.bottom = "0";
  }

  ancestorsPanel.style.display = "block";
  const html = `
    <div class="page-ancestors-header">
      <span class="page-ancestors-count">${count}</span>
      <span class="page-ancestors-label">Ancestor${count > 1 ? "s" : ""} above this page</span>
    </div>
    <div class="page-ancestors-list">
      ${hiddenAncestors
        .map(
          (node) => `
        <div class="page-ancestor-item" data-node-id="${node.id}">
          <span class="page-ancestor-content">${escapeHtml(node.content) || "(empty)"}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  // Skip re-render if content unchanged (prevents MutationObserver loop)
  if (html === lastAncestorHTML) return;
  lastAncestorHTML = html;
  ancestorsPanel.innerHTML = html;

  // Click to navigate to ancestor
  ancestorsPanel.querySelectorAll(".page-ancestor-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nodeId = (item as HTMLElement).dataset.nodeId;
      if (nodeId) void store.zoomIn(nodeId);
    });
  });

  // Delegate fallback on panel itself
  ancestorsPanel.onmousedown = (e) => {
    const target = (e.target as HTMLElement).closest(".page-ancestor-item") as HTMLElement | null;
    if (target) {
      const nodeId = target.dataset.nodeId;
      e.preventDefault();
      e.stopPropagation();
      if (nodeId) void store.zoomIn(nodeId);
    }
  };
}

/* ─── CSS injection ─── */

function injectCSS(): void {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent = PAGE_CSS;
  document.head.appendChild(styleEl);
}

function removeCSS(): void {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

/* ─── Content wrapping / unwrapping ─── */

function wrapPageContent(editor: HTMLElement, nodeId: string): void {
  if (editor.querySelector(".page-wikilink-wrapper")) return;
  if (editor.contains(document.activeElement)) return;

  const wrapper = document.createElement("span");
  wrapper.className = "page-wikilink-wrapper";

  if (!editablePageNodes) {
    wrapper.setAttribute("contenteditable", "false");
    wrapper.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void store.zoomIn(nodeId);
    });
  }

  while (editor.firstChild) {
    wrapper.appendChild(editor.firstChild);
  }

  editor.appendChild(wrapper);
}

function unwrapPageContent(editor: HTMLElement): void {
  const wrapper = editor.querySelector(".page-wikilink-wrapper");
  if (!wrapper) return;

  while (wrapper.firstChild) {
    editor.appendChild(wrapper.firstChild);
  }
  wrapper.remove();
}

/* ─── Focus handlers ─── */

let focusForcingZoom = false;
let lastZoomChangeTime = 0;

function handleFocusIn(e: FocusEvent): void {
  if (editablePageNodes) return;

  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;

  const nodeId = target.dataset.nodeId;
  if (!nodeId || !isPage(nodeId)) return;

  const zoomedId = store.getState().zoomedNodeId;
  if (zoomedId !== nodeId) {
    // Ignore reflexive focus that happens right after leaving a page
    if (Date.now() - lastZoomChangeTime < 400) return;
    // Not in page — blur and zoom in instead of editing
    focusForcingZoom = true;
    target.blur();
    focusForcingZoom = false;
    void store.zoomIn(nodeId);
  }
}

function handleFocusOut(e: FocusEvent): void {
  if (focusForcingZoom) return;
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;

  const nodeId = target.dataset.nodeId;
  if (!nodeId || !isPage(nodeId)) return;

  // After blur, check if wrapping needed
  requestAnimationFrame(() => scanAndTransform());
}

/* ─── Breadcrumb editing ─── */

async function startEditingZoomedNode(): Promise<void> {
  const zoomedId = store.getState().zoomedNodeId;
  if (!zoomedId) {
    showCopyToast("No node focused — zoom into a node first");
    return;
  }

  const activeEl = document.querySelector<HTMLElement>(".breadcrumb-active");
  if (!activeEl) return;

  const currentText = activeEl.textContent || "";
  const originalHTML = activeEl.innerHTML;

  const container = document.createElement("span");
  container.style.cssText = "display: inline-flex; align-items: center; gap: 4px;";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "breadcrumb-edit-input";
  input.value = currentText;
  input.style.cssText = `
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    background: var(--bg, #1a1a2e);
    border: 1px solid var(--accent, #4fc3f7);
    border-radius: 4px;
    padding: 2px 6px;
    outline: none;
    width: 180px;
  `;

  const btnStyle = `
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid var(--border, #333);
    cursor: pointer;
    font-family: inherit;
    background: var(--bg, #1a1a2e);
    color: var(--text, #e0e0e0);
  `;

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.cssText = btnStyle;
  saveBtn.title = "Save (Enter)";

  const discardBtn = document.createElement("button");
  discardBtn.textContent = "Discard";
  discardBtn.style.cssText = btnStyle;
  discardBtn.title = "Discard (Escape)";

  container.appendChild(input);
  container.appendChild(saveBtn);
  container.appendChild(discardBtn);

  activeEl.textContent = "";
  activeEl.appendChild(container);
  input.focus();
  input.select();

  const discard = () => {
    activeEl.innerHTML = originalHTML;
  };

  const save = async () => {
    const newText = input.value.trim();
    activeEl.innerHTML = originalHTML;
    if (newText && newText !== currentText) {
      await api.updateNode({ id: zoomedId, content: newText });
      store.markModified(zoomedId);
      showCopyToast("Content updated");
    }
  };

  saveBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    void save();
  });

  discardBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    discard();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      discard();
    }
  });

  input.addEventListener("blur", () => {
    // Delay to let button clicks fire first
    setTimeout(() => {
      if (activeEl.querySelector(".breadcrumb-edit-input")) {
        discard();
      }
    }, 150);
  });
}

function handleBreadcrumbContextMenu(e: MouseEvent): void {
  if (!breadcrumbEditing) return;

  const target = (e.target as HTMLElement).closest(".breadcrumb-active") as HTMLElement | null;
  if (!target) return;

  const zoomedId = store.getState().zoomedNodeId;
  if (!zoomedId) return;

  e.preventDefault();
  e.stopPropagation();

  // Remove any existing breadcrumb context menu
  const existing = document.querySelector(".breadcrumb-ctx-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.className = "breadcrumb-ctx-menu";
  menu.style.cssText = `
    position: fixed;
    z-index: 1000;
    background: var(--bg-secondary, #16213e);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    padding: 4px 0;
    min-width: 140px;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  const item = document.createElement("div");
  item.textContent = "Edit Content";
  item.style.cssText = `
    padding: 6px 14px;
    cursor: pointer;
    color: var(--text, #e0e0e0);
    transition: background 0.1s;
  `;
  item.addEventListener("mouseenter", () => {
    item.style.background = "var(--focus-bg, rgba(100, 149, 237, 0.12))";
  });
  item.addEventListener("mouseleave", () => {
    item.style.background = "";
  });
  item.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    menu.remove();
    void startEditingZoomedNode();
  });

  menu.appendChild(item);
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
  document.body.appendChild(menu);

  const closeMenu = (ev: Event) => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove();
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("contextmenu", closeMenu);
    }
  };
  document.addEventListener("mousedown", closeMenu);
  document.addEventListener("contextmenu", closeMenu);
}

/* ─── Main scan loop ─── */

let scanning = false;

function scanAndTransform(): void {
  if (scanning) return;
  scanning = true;
  try {

  const zoomedId = store.getState().zoomedNodeId;

  const nodes = document.querySelectorAll<HTMLElement>(
    ".outline-node[data-node-id]"
  );
  for (const nodeEl of nodes) {
    const nodeId = nodeEl.dataset.nodeId;
    if (!nodeId) continue;

    const editor = nodeEl.querySelector<HTMLElement>(".node-editor");
    if (!editor) continue;

    if (isPage(nodeId)) {
      if (zoomedId === nodeId) {
        nodeEl.classList.add("in-page");
        unwrapPageContent(editor);
      } else {
        nodeEl.classList.remove("in-page");
        wrapPageContent(editor, nodeId);
      }
    } else {
      nodeEl.classList.remove("in-page");
      unwrapPageContent(editor);
    }
  }
  } finally {
    scanning = false;
  }
}

/* ─── Plugin ─── */

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    syncPageCacheFromStore();
    loadBreadcrumbPref();
    loadEditablePref();
    loadBreadcrumbEditablePref();
    injectCSS();

    // Initial scan
    requestAnimationFrame(() => { scanAndTransform(); applyBreadcrumbTruncation(); updateAncestorPanel(); });

    // Watch for DOM changes
    observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      );
      if (hasNewNodes) {
        requestAnimationFrame(() => { scanAndTransform(); applyBreadcrumbTruncation(); updateAncestorPanel(); });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Handle focus on page nodes outside page context
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    // Handle breadcrumb right-click editing
    document.addEventListener("contextmenu", handleBreadcrumbContextMenu);

    // React to zoom changes
    unsubStore = store.subscribe((state) => {
      syncPageCacheFromStore();
      if (state.zoomedNodeId !== lastZoomedId) {
        lastZoomedId = state.zoomedNodeId;
        lastZoomChangeTime = Date.now();
        requestAnimationFrame(() => { scanAndTransform(); applyBreadcrumbTruncation(); updateAncestorPanel(); });
      }
    });

    ancestorsPanel = createAncestorsPanel();
    document.body.appendChild(ancestorsPanel);
    updateAncestorPanel();

    // Register commands
    ctx.registerCommand({
      id: "page-mode-remove",
      name: "Remove Page Mode",
      category: "Page",
      keywords: ["page", "wikilink", "remove", "unpage", "normal"],
      execute: () => {
        const state = store.getState();
        // Prefer zoomed node (when inside a page), fall back to focused node
        const targetId = state.zoomedNodeId || state.focusedNodeId;
        if (!targetId) return;
        if (!isPage(targetId)) {
          showCopyToast("Current node is not a page");
          return;
        }
        store.togglePage(targetId);
        requestAnimationFrame(() => scanAndTransform());
        showCopyToast("Removed page mode. Children are visible again.");
      },
    });

    ctx.registerCommand({
      id: "page-mode-toggle",
      name: "Toggle Page Mode",
      category: "Page",
      keywords: ["page", "wikilink", "toggle"],
      execute: () => {
        const state = store.getState();
        const focusedId = state.focusedNodeId;
        if (!focusedId) return;

        const became = !isPage(focusedId);
        store.togglePage(focusedId);
        requestAnimationFrame(() => scanAndTransform());

        if (became) {
          showCopyToast("Turned into page. Click [[..]] to enter.");
        } else {
          showCopyToast("Removed page mode. Children are visible again.");
        }
      },
    });

    ctx.registerCommand({
      id: "breadcrumb-truncate-toggle",
      name: "Toggle Breadcrumb Truncation",
      category: "Page",
      keywords: ["page", "breadcrumb", "truncate", "scope"],
      execute: () => {
        breadcrumbTruncate = !breadcrumbTruncate;
        saveBreadcrumbPref();
        requestAnimationFrame(() => { applyBreadcrumbTruncation(); updateAncestorPanel(); });

        if (breadcrumbTruncate) {
          const pageNode = findPageAncestorInBreadcrumbs();
          const label = pageNode?.content || "page";
          showCopyToast(`Breadcrumb scoped to: ${label}`);
        } else {
          showCopyToast("Full breadcrumb hierarchy restored");
        }
      },
    });

    ctx.registerCommand({
      id: "page-editable-toggle",
      name: "Toggle Page Edit Mode",
      category: "Page",
      keywords: ["page", "edit", "editable", "inline"],
      execute: () => {
        editablePageNodes = !editablePageNodes;
        saveEditablePref();
        requestAnimationFrame(() => scanAndTransform());
        showCopyToast(editablePageNodes ? "Page nodes are now editable" : "Click page content to enter page");
      },
    });

    ctx.registerCommand({
      id: "breadcrumb-editable-toggle",
      name: "Toggle Breadcrumb Editing",
      category: "Page",
      keywords: ["breadcrumb", "edit", "rename", "content"],
      execute: () => {
        breadcrumbEditing = !breadcrumbEditing;
        saveBreadcrumbEditablePref();
        showCopyToast(breadcrumbEditing ? "Right-click breadcrumb to edit node content" : "Breadcrumb editing disabled");
      },
    });

    ctx.registerCommand({
      id: "edit-zoomed-node",
      name: "Edit Current Node",
      category: "Page",
      keywords: ["edit", "rename", "current", "zoomed", "title"],
      execute: () => startEditingZoomedNode(),
    });

    // Register context menu items (per-node actions)
    await ctx.emit("context-menu:register", {
      id: "page-mode-make",
      pluginId: manifest.id,
      label: "Turn into Page",
      dividerBefore: true,
      execute: (nodeId: string) => {
        if (isPage(nodeId)) return;
        store.togglePage(nodeId);
        requestAnimationFrame(() => scanAndTransform());
        showCopyToast("Turned into page. Click [[..]] to enter.");
      },
    });

    await ctx.emit("context-menu:register", {
      id: "page-mode-remove",
      pluginId: manifest.id,
      label: "Turn Back into Block",
      execute: (nodeId: string) => {
        if (!isPage(nodeId)) return;
        store.togglePage(nodeId);
        requestAnimationFrame(() => scanAndTransform());
        showCopyToast("Turned back into block. Children are visible again.");
      },
    });

    console.log("[third-party-page-mode] renderer ready");
  },

  async onUnload() {
    if (ctxRef) {
      await ctxRef.emit("context-menu:unregister", { pluginId: manifest.id, id: "page-mode-make" });
      await ctxRef.emit("context-menu:unregister", { pluginId: manifest.id, id: "page-mode-remove" });
      ctxRef.unregisterAllCommands();
      ctxRef = null;
    }

    removeCSS();

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (unsubStore) {
      unsubStore();
      unsubStore = null;
    }

    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    document.removeEventListener("contextmenu", handleBreadcrumbContextMenu);

    // Remove breadcrumb truncation markers
    const container = document.querySelector<HTMLElement>(".breadcrumb-container");
    if (container) {
      container.querySelectorAll(".breadcrumb-scope-hidden").forEach((el) => {
        el.classList.remove("breadcrumb-scope-hidden");
      });
      const boundary = container.querySelector(".page-scope-boundary");
      if (boundary) boundary.classList.remove("page-scope-boundary");
    }

    if (ancestorsPanel) {
      ancestorsPanel.remove();
      ancestorsPanel = null;
    }

    // Unwrap all page content
    const editors = document.querySelectorAll<HTMLElement>(".node-editor");
    for (const editor of editors) {
      unwrapPageContent(editor);
    }

    // Remove page attributes
    const pageNodes = document.querySelectorAll<HTMLElement>(
      ".outline-node[data-is-page]"
    );
    for (const node of pageNodes) {
      node.removeAttribute("data-is-page");
      node.classList.remove("in-page");
    }
  },
};

export default plugin;
