import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import type { OutlineNode } from "../../../shared/types";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

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
  pageIds = next;
}

function isPage(id: string): boolean {
  return pageIds.has(id);
}

async function togglePageAsync(id: string): Promise<boolean> {
  const became = !pageIds.has(id);
  try {
    await api.updateNode({ id, is_page: became });
    // Optimistic: update cache, then refresh from tree on next load
    if (became) pageIds.add(id);
    else pageIds.delete(id);
    return became;
  } catch {
    return !became;
  }
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

  console.log(`[page-ancestors] updateAncestorPanel — truncate=${breadcrumbTruncate}, crumbs=[${store.getState().breadcrumbs.map(b => b.content).join(' > ')}]`);

  if (!breadcrumbTruncate) {
    console.log("[page-ancestors] hiding: breadcrumb truncation disabled");
    ancestorsPanel.style.display = "none";
    return;
  }

  const breadcrumbs = store.getState().breadcrumbs;
  if (breadcrumbs.length === 0) {
    console.log("[page-ancestors] hiding: no breadcrumbs in store");
    ancestorsPanel.style.display = "none";
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

  console.log(`[page-ancestors] pageIndex=${pageIndex}${pageIndex >= 0 ? ` pageNode="${breadcrumbs[pageIndex].content}"` : ''}`);

  // No page ancestor, or page is at root level — nothing hidden
  if (pageIndex <= 0) {
    console.log(`[page-ancestors] hiding: pageIndex=${pageIndex} (page not found or at root)`);
    ancestorsPanel.style.display = "none";
    return;
  }

  // Ancestors above the page boundary (index 0 to pageIndex - 1)
  const hiddenAncestors = breadcrumbs.slice(0, pageIndex);
  if (hiddenAncestors.length === 0) {
    console.log("[page-ancestors] hiding: no hidden ancestors above page");
    ancestorsPanel.style.display = "none";
    return;
  }

  const count = hiddenAncestors.length;

  console.log(`[page-ancestors] showing ${count} ancestors: ${hiddenAncestors.map(a => a.content).join(' > ')}`);

  // Offset bottom when backlinks panel is also visible
  const backlinksPanel = document.querySelector<HTMLElement>(".backlinks-panel");
  if (backlinksPanel && backlinksPanel.style.display !== "none") {
    ancestorsPanel.style.bottom = `${backlinksPanel.offsetHeight}px`;
  } else {
    ancestorsPanel.style.bottom = "0";
  }

  ancestorsPanel.style.display = "block";
  ancestorsPanel.innerHTML = `
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

  // Click to navigate to ancestor
  const items = ancestorsPanel.querySelectorAll(".page-ancestor-item");
  console.log(`[page-ancestors] attaching mousedown handlers to ${items.length} items`);
  items.forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nodeId = (item as HTMLElement).dataset.nodeId;
      const content = (item as HTMLElement).querySelector(".page-ancestor-content")?.textContent || "";
      console.log(`[page-ancestors] mousedown: id=${nodeId}, content="${content}"`);
      if (nodeId) {
        console.log(`[page-ancestors] calling store.zoomIn("${nodeId}")`);
        void store.zoomIn(nodeId);
      }
    });
  });

  // Delegate fallback: catch any click on the panel
  ancestorsPanel.onmousedown = (e) => {
    const target = (e.target as HTMLElement).closest(".page-ancestor-item") as HTMLElement | null;
    if (target) {
      const nodeId = target.dataset.nodeId;
      const content = target.querySelector(".page-ancestor-content")?.textContent || "";
      console.log(`[page-ancestors] DELEGATE mousedown: id=${nodeId}, content="${content}"`);
      e.preventDefault();
      e.stopPropagation();
      if (nodeId) {
        console.log(`[page-ancestors] DELEGATE calling store.zoomIn("${nodeId}")`);
        void store.zoomIn(nodeId);
      }
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

function handleFocusIn(e: FocusEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;

  const nodeId = target.dataset.nodeId;
  if (!nodeId || !isPage(nodeId)) return;

  const zoomedId = store.getState().zoomedNodeId;
  if (zoomedId !== nodeId) {
    // Not in page — blur and zoom in instead of editing
    target.blur();
    void store.zoomIn(nodeId);
  }
}

function handleFocusOut(e: FocusEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;

  const nodeId = target.dataset.nodeId;
  if (!nodeId || !isPage(nodeId)) return;

  // After blur, check if wrapping needed
  requestAnimationFrame(() => scanAndTransform());
}

/* ─── Main scan loop ─── */

function scanAndTransform(): void {
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
      nodeEl.setAttribute("data-is-page", "");

      if (zoomedId === nodeId) {
        nodeEl.classList.add("in-page");
        unwrapPageContent(editor);
      } else {
        nodeEl.classList.remove("in-page");
        wrapPageContent(editor, nodeId);
      }
    } else {
      nodeEl.removeAttribute("data-is-page");
      nodeEl.classList.remove("in-page");
      unwrapPageContent(editor);
    }
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
        console.log(`[page-ancestors] zoom changed: ${lastZoomedId} → ${state.zoomedNodeId}`);
        lastZoomedId = state.zoomedNodeId;
        requestAnimationFrame(() => { scanAndTransform(); applyBreadcrumbTruncation(); updateAncestorPanel(); });
      }
    });

    ancestorsPanel = createAncestorsPanel();
    document.body.appendChild(ancestorsPanel);
    updateAncestorPanel();

    // Register commands
    ctx.registerCommand({
      id: "page-mode-toggle",
      name: "Toggle Page Mode",
      category: "Page",
      keywords: ["page", "wikilink", "toggle"],
      execute: async () => {
        const state = store.getState();
        const focusedId = state.focusedNodeId;
        if (!focusedId) return;

        const became = await togglePageAsync(focusedId);
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
