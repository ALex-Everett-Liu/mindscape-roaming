import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";

const PAGE_IDS_KEY = "mindscape_page_ids";

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
`;

let styleEl: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let unsubStore: (() => void) | null = null;
let lastZoomedId: string | null | undefined = undefined;
let pageIds: Set<string> = new Set();

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

/* ─── Page ID persistence ─── */

function loadPageIds(): void {
  try {
    const raw = localStorage.getItem(PAGE_IDS_KEY);
    if (raw) {
      pageIds = new Set(JSON.parse(raw));
    }
  } catch {
    /* ignore */
  }
}

function savePageIds(): void {
  try {
    localStorage.setItem(PAGE_IDS_KEY, JSON.stringify([...pageIds]));
  } catch {
    /* ignore */
  }
}

function isPage(id: string): boolean {
  return pageIds.has(id);
}

function togglePage(id: string): boolean {
  if (pageIds.has(id)) {
    pageIds.delete(id);
    savePageIds();
    return false;
  } else {
    pageIds.add(id);
    savePageIds();
    return true;
  }
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
    loadPageIds();
    injectCSS();

    // Initial scan
    requestAnimationFrame(() => scanAndTransform());

    // Watch for DOM changes
    observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      );
      if (hasNewNodes) {
        requestAnimationFrame(() => scanAndTransform());
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Handle focus on page nodes outside page context
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    // React to zoom changes
    unsubStore = store.subscribe((state) => {
      if (state.zoomedNodeId !== lastZoomedId) {
        lastZoomedId = state.zoomedNodeId;
        requestAnimationFrame(() => scanAndTransform());
      }
    });

    // Register commands
    ctx.registerCommand({
      id: "page-mode-toggle",
      name: "Toggle Page Mode",
      category: "Page",
      keywords: ["page", "wikilink", "toggle"],
      execute: () => {
        const state = store.getState();
        const focusedId = state.focusedNodeId;
        if (!focusedId) return;

        const became = togglePage(focusedId);
        requestAnimationFrame(() => scanAndTransform());

        if (became) {
          showCopyToast("Turned into page. Click [[..]] to enter.");
        } else {
          showCopyToast("Removed page mode. Children are visible again.");
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
