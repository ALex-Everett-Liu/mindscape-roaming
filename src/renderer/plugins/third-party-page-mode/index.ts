import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import type { OutlineNode } from "../../../shared/types";
import { manifest } from "./manifest";
import { store } from "../../state/store";

const BREADCRUMB_TRUNCATE_KEY = "mindscape_page_breadcrumb_truncate";

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
  right: 0;
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

/* ─── Debug log buffer ─── */

const debugLogs: string[] = [];
function logDebug(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  debugLogs.push(line);
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
  logDebug(`syncPageCache: ${pageIds.size} -> ${next.size} pages (tree:${store.getState().tree.length} crumbs:${store.getState().breadcrumbs.length})`);
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

  // No page ancestor, or page is at root level — nothing hidden
  if (pageIndex <= 0) {
    ancestorsPanel.style.display = "none";
    lastAncestorHTML = "";
    return;
  }

  // Ancestors above the page boundary (index 0 to pageIndex - 1)
  const hiddenAncestors = breadcrumbs.slice(0, pageIndex);
  if (hiddenAncestors.length === 0) {
    ancestorsPanel.style.display = "none";
    lastAncestorHTML = "";
    return;
  }

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

  logDebug(`wrapPageContent: wrapping editor for page node "${nodeId}"`);

  const wrapper = document.createElement("span");
  wrapper.className = "page-wikilink-wrapper";
  wrapper.setAttribute("contenteditable", "false");

  while (editor.firstChild) {
    wrapper.appendChild(editor.firstChild);
  }

  wrapper.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void store.zoomIn(nodeId);
  });

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
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;

  const nodeId = target.dataset.nodeId;
  logDebug(`focusin: editor nodeId=${nodeId}, isPage=${isPage(nodeId ?? '')}, zoomedId=${store.getState().zoomedNodeId}`);
  if (!nodeId || !isPage(nodeId)) return;

  const zoomedId = store.getState().zoomedNodeId;
  if (zoomedId !== nodeId) {
    // Ignore reflexive focus that happens right after leaving a page
    if (Date.now() - lastZoomChangeTime < 400) return;
    // Not in page — blur and zoom in instead of editing
    logDebug(`focusin: NOT in page, zooming in to page node "${nodeId}"`);
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

/* ─── Main scan loop ─── */

let scanning = false;

function scanAndTransform(): void {
  if (scanning) {
    logDebug("scanAndTransform: RE-ENTRY GUARD, skipping");
    return;
  }
  scanning = true;
  try {
  const zoomedId = store.getState().zoomedNodeId;
  logDebug(`scanAndTransform: zoomedId=${zoomedId}, pageIds.size=${pageIds.size}`);

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
    syncPageCacheFromStore();
    loadBreadcrumbPref();
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
      id: "page-mode-dump-logs",
      name: "Dump Page Debug Logs",
      category: "Page",
      keywords: ["page", "debug", "log", "dump", "txt"],
      execute: () => {
        const text = debugLogs.join("\n");
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `page-mode-debug-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showCopyToast(`Dumped ${debugLogs.length} log lines`);
      },
    });

    console.log("[third-party-page-mode] renderer ready");
  },

  async onUnload() {
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
