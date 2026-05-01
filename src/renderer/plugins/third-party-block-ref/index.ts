import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import type { OutlineNode } from "../../../shared/types";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

const BLOCK_REF_REGEX = /\(\(([^\s)]+)\)\)/g;
const REF_DISPLAY_KEY = "mindscape_block_ref_display";

let refDisplayMode: "uuid" | "content" = "uuid";

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

function loadRefDisplayMode(): void {
  try {
    const saved = localStorage.getItem(REF_DISPLAY_KEY);
    if (saved === "content") refDisplayMode = "content";
    else refDisplayMode = "uuid";
  } catch {
    refDisplayMode = "uuid";
  }
}

function saveRefDisplayMode(): void {
  try {
    localStorage.setItem(REF_DISPLAY_KEY, refDisplayMode);
  } catch {
    /* ignore */
  }
}

const REF_CSS = `
.block-ref-wrapper {
  display: inline;
  color: var(--accent, #4fc3f7);
  background: rgba(79, 195, 247, 0.1);
  border-radius: 3px;
  padding: 0 3px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s;
  user-select: text;
}
.block-ref-wrapper:hover {
  background: rgba(79, 195, 247, 0.25);
  text-decoration: underline;
}
.block-ref-wrapper.content-mode {
  color: inherit;
  background: rgba(79, 195, 247, 0.06);
  border-bottom: 1px dashed rgba(79, 195, 247, 0.4);
  border-radius: 0;
  padding-left: 0;
  padding-right: 0;
}
.block-ref-wrapper.content-mode:hover {
  background: rgba(79, 195, 247, 0.12);
  text-decoration: none;
  border-bottom-color: var(--accent, #4fc3f7);
}
.block-ref-wrapper.content-mode::after {
  content: "↩";
  opacity: 0.5;
  font-size: 0.8em;
  margin-left: 3px;
  vertical-align: super;
}
.block-ref-wrapper::before {
  content: "↪";
  opacity: 0.7;
  font-size: 0.85em;
  margin-right: 2px;
}
.block-ref-wrapper.content-mode::before {
  content: none;
}
.block-ref-preview {
  position: fixed;
  background: var(--bg, #1a1a2e);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  padding: 8px 12px;
  max-width: 320px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text, #e0e0e0);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 1000;
  pointer-events: none;
  white-space: pre-wrap;
  word-break: break-word;
}
.block-ref-preview::after {
  content: "Click to jump";
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted, #888);
  font-style: italic;
}
.backlinks-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg, #1a1a2e);
  border-top: 1px solid var(--border, #333);
  z-index: 50;
  font-size: 13px;
  max-height: 200px;
  overflow-y: auto;
}
.backlinks-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  position: sticky;
  top: 0;
  background: var(--bg, #1a1a2e);
  border-bottom: 1px solid var(--border, #333);
}
.backlinks-count {
  background: var(--accent, #4fc3f7);
  color: #000;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}
.backlinks-label {
  color: var(--text-muted, #888);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}
.backlinks-toggle {
  color: var(--text-muted, #888);
  font-size: 10px;
}
.backlinks-list {
  padding: 4px 0;
}
.backlink-item {
  padding: 6px 16px 6px 32px;
  color: var(--text, #e0e0e0);
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.1s;
  font-size: 13px;
  line-height: 1.4;
}
.backlink-item:hover {
  background: var(--focus-bg, rgba(255,255,255,0.05));
  border-left-color: var(--accent, #4fc3f7);
}
.backlink-content {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.backlink-breadcrumb {
  display: block;
  font-size: 11px;
  color: var(--text-muted, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.backlink-crumb-sep {
  opacity: 0.4;
}
.backlink-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent, #4fc3f7);
  color: #000;
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  margin-left: 4px;
  cursor: pointer;
  user-select: none;
  line-height: 1;
}
.backlink-badge:hover {
  filter: brightness(1.2);
}
`;

let styleEl: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let tooltipEl: HTMLDivElement | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let backlinksPanel: HTMLDivElement | null = null;
let unsubStore: (() => void) | null = null;
let lastZoomedNodeId: string | null | undefined = undefined;
let backlinksCollapsed = false;
let annotatingBadges = false;
const contentCache = new Map<string, string>();
let backlinkCountCache: Record<string, number> = {};

/* ─── CSS injection ─── */

function injectCSS(): void {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent = REF_CSS;
  document.head.appendChild(styleEl);
}

function removeCSS(): void {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

/* ─── Tooltip ─── */

function showTooltip(target: HTMLElement, content: string): void {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.className = "block-ref-preview";
  tooltipEl.textContent = content || "(empty)";
  document.body.appendChild(tooltipEl);

  const rect = target.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left;

  // Keep inside viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tipRect = tooltipEl.getBoundingClientRect();
  if (left + tipRect.width > vw - 8) {
    left = vw - tipRect.width - 8;
  }
  if (left < 8) left = 8;
  if (top + tipRect.height > vh - 8) {
    top = rect.top - tipRect.height - 6;
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}

/* ─── Backlink count badges ─── */

async function fetchBacklinkCounts(): Promise<void> {
  try {
    const res = await api.getBacklinkCounts();
    if (res.success && res.data) {
      backlinkCountCache = res.data;
      annotateBacklinkBadges();
    }
  } catch {
    /* ignore */
  }
}

function annotateBacklinkBadges(): void {
  if (annotatingBadges) return;
  annotatingBadges = true;
  try {
    const nodes = document.querySelectorAll<HTMLElement>(".outline-node[data-node-id]");
    for (const nodeEl of nodes) {
      const id = nodeEl.dataset.nodeId;
      if (!id) continue;

      const row = nodeEl.querySelector<HTMLElement>(".node-row");
      if (!row) continue;

      const existing = row.querySelector<HTMLElement>(".backlink-badge");
      const count = backlinkCountCache[id] || 0;

      if (count === 0) {
        if (existing) existing.remove();
        continue;
      }

      if (existing) {
        const text = String(count);
        if (existing.textContent !== text) {
          existing.textContent = text;
        }
        continue;
      }

    const badge = document.createElement("span");
    badge.className = "backlink-badge";
    badge.textContent = String(count);
    badge.title = `${count} linked reference${count > 1 ? "s" : ""}`;
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      void store.zoomIn(id);
    });

      // Insert after the node-editor
      const editor = row.querySelector<HTMLElement>(".node-editor");
      if (editor) {
        editor.after(badge);
      } else {
        row.appendChild(badge);
      }
    }
  } finally {
    annotatingBadges = false;
  }
}

/* ─── Backlinks panel ─── */

function createBacklinksPanel(): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = "backlinks-panel";
  panel.style.display = "none";
  return panel;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function buildBreadcrumbHTML(ancestors: OutlineNode[]): string {
  if (ancestors.length === 0) return "";
  const crumbs = ancestors
    .map((a) => escapeHtml(a.content || "(empty)"))
    .join(" <span class=\"backlink-crumb-sep\">\u203a</span> ");
  return `<span class="backlink-breadcrumb">${crumbs}</span>`;
}

async function updateBacklinksPanel(zoomedNodeId: string | null): Promise<void> {
  if (!backlinksPanel) return;

  if (!zoomedNodeId) {
    backlinksPanel.style.display = "none";
    backlinksPanel.innerHTML = "";
    return;
  }

  const res = await api.getBlockBacklinks(zoomedNodeId);
  if (!res.success || !res.data || res.data.length === 0) {
    backlinksPanel.style.display = "none";
    backlinksPanel.innerHTML = "";
    return;
  }

  const nodes = res.data;
  const count = nodes.length;

  // Fetch ancestors for all backlinks in parallel
  const ancestorsMap = new Map<string, OutlineNode[]>();
  await Promise.all(
    nodes.map(async (node) => {
      try {
        const ancRes = await api.getAncestors(node.id);
        if (ancRes.success && ancRes.data) {
          ancestorsMap.set(node.id, ancRes.data);
        }
      } catch {
        /* ignore */
      }
    })
  );

  // Resolve block-refs in backlink content using existing cache
  const refRegex = BLOCK_REF_REGEX;
  const resolvedContentMap = new Map<string, string>();

  for (const node of nodes) {
    let resolved = node.content || "";
    const refIds = new Set<string>();
    let m: RegExpExecArray | null;
    refRegex.lastIndex = 0;
    while ((m = refRegex.exec(resolved)) !== null) {
      refIds.add(m[1]);
    }
    refRegex.lastIndex = 0;

    if (refIds.size > 0) {
      // Fetch any uncached refs
      await Promise.all(
        [...refIds].map(async (refId) => {
          if (contentCache.has(refId)) return;
          try {
            const refRes = await api.resolveBlockRef(refId);
            if (refRes.success && refRes.data) {
              contentCache.set(refId, (refRes.data as any).content || "(empty)");
            }
          } catch {
            contentCache.set(refId, "(error)");
          }
        })
      );

      // Replace all refs with cached content
      for (const refId of refIds) {
        const cached = contentCache.get(refId) || "...";
        resolved = resolved.split(`((${refId}))`).join(cached);
      }
    }

    resolvedContentMap.set(node.id, resolved);
  }

  backlinksPanel.style.display = "block";
  backlinksPanel.innerHTML = `
    <div class="backlinks-header">
      <span class="backlinks-count">${count}</span>
      <span class="backlinks-label">Linked Reference${count > 1 ? "s" : ""}</span>
      <span class="backlinks-toggle">${backlinksCollapsed ? "▶" : "▼"}</span>
    </div>
    <div class="backlinks-list" style="${backlinksCollapsed ? "display:none" : ""}">
      ${nodes
        .map(
          (node) => `
        <div class="backlink-item" data-node-id="${node.id}">
          <span class="backlink-content">${escapeHtml(resolvedContentMap.get(node.id) || node.content) || "(empty)"}</span>
          ${buildBreadcrumbHTML(ancestorsMap.get(node.id) || [])}
        </div>
      `
        )
        .join("")}
    </div>
  `;

  const header = backlinksPanel.querySelector(".backlinks-header");
  header?.addEventListener("click", () => {
    backlinksCollapsed = !backlinksCollapsed;
    const list = backlinksPanel!.querySelector(".backlinks-list") as HTMLElement | null;
    const toggle = backlinksPanel!.querySelector(".backlinks-toggle");
    if (list) list.style.display = backlinksCollapsed ? "none" : "block";
    if (toggle) toggle.textContent = backlinksCollapsed ? "▶" : "▼";
  });

  backlinksPanel.querySelectorAll(".backlink-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const nodeId = (item as HTMLElement).dataset.nodeId;
      if (nodeId) void store.zoomIn(nodeId);
    });
  });
}

/* ─── DOM helpers ─── */

function getEditors(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".node-editor"));
}

/**
 * Unwrap any `.block-ref-wrapper` spans back to plain text.
 * Setting textContent flattens everything, which naturally restores `((id))`.
 */
function unwrapRefs(editor: HTMLElement): void {
  if (editor.querySelector(".block-ref-wrapper")) {
    editor.textContent = editor.textContent;
  }
}

/**
 * Replace a single Text node containing `((id))` patterns with a mix of
 * text nodes and styled wrapper spans.
 */
function wrapTextNode(
  node: Text,
  onMatch: (id: string) => HTMLElement
): void {
  const text = node.textContent || "";
  const parent = node.parentNode;
  if (!parent) return;

  const matches: Array<{ index: number; length: number; id: string }> = [];
  let m: RegExpExecArray | null;
  BLOCK_REF_REGEX.lastIndex = 0;
  while ((m = BLOCK_REF_REGEX.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, id: m[1] });
  }
  if (matches.length === 0) return;

  const fragments: Node[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.index > lastIndex) {
      fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    fragments.push(onMatch(match.id));
    lastIndex = match.index + match.length;
  }
  if (lastIndex < text.length) {
    fragments.push(document.createTextNode(text.slice(lastIndex)));
  }

  for (const frag of fragments) {
    parent.insertBefore(frag, node);
  }
  parent.removeChild(node);
}

/* ─── Transform logic ─── */

async function transformEditor(editor: HTMLElement): Promise<void> {
  if (editor.contains(document.activeElement)) return;
  if (editor.querySelector(".block-ref-wrapper")) return; // already transformed

  const raw = editor.textContent || "";
  if (!BLOCK_REF_REGEX.test(raw)) return;
  BLOCK_REF_REGEX.lastIndex = 0;

  // Collect referenced IDs
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = BLOCK_REF_REGEX.exec(raw)) !== null) {
    ids.add(m[1]);
  }
  BLOCK_REF_REGEX.lastIndex = 0;

  // Pre-fetch content for all refs in parallel
  await Promise.all(
    [...ids].map(async (id) => {
      if (contentCache.has(id)) return;
      try {
        const res = await api.resolveBlockRef(id);
        if (res.success && res.data) {
          contentCache.set(id, (res.data as any).content || "(empty)");
        } else {
          contentCache.set(id, "(not found)");
        }
      } catch {
        contentCache.set(id, "(error)");
      }
    })
  );

  // Gather all text nodes (must snapshot before mutating)
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    if (!textNode.parentNode) continue;
    const txt = textNode.textContent || "";
    if (!BLOCK_REF_REGEX.test(txt)) continue;
    BLOCK_REF_REGEX.lastIndex = 0;

    wrapTextNode(textNode, (id) => {
      const span = document.createElement("span");
      span.dataset.refId = id;
      span.contentEditable = "false";

      const isContentMode = refDisplayMode === "content";
      const content = contentCache.get(id) || "(loading)";

      if (isContentMode) {
        span.className = "block-ref-wrapper content-mode";
        span.textContent = content;
      } else {
        span.className = "block-ref-wrapper";
        span.textContent = `(( ${id} ))`;
      }

      span.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void store.zoomIn(id);
      });

      span.addEventListener("mouseenter", () => {
        if (isContentMode) {
          showTooltip(span, `(( ${id} ))`);
        } else {
          showTooltip(span, contentCache.get(id) || "...");
        }
      });

      span.addEventListener("mouseleave", () => {
        hideTooltip();
      });

      return span;
    });
  }
}

/* ─── Event handlers ─── */

function handleFocusIn(e: FocusEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;
  unwrapRefs(target);
  hideTooltip();
}

function handleFocusOut(e: FocusEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;
  void transformEditor(target);
}

function scanAndTransform(): void {
  for (const editor of getEditors()) {
    if (!editor.contains(document.activeElement)) {
      void transformEditor(editor);
    }
  }
}

/* ─── Plugin export ─── */

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    loadRefDisplayMode();
    injectCSS();

    // Transform any editors already in the DOM
    scanAndTransform();
    void fetchBacklinkCounts();

    // Watch for newly added editors (tree re-renders, new nodes, etc.)
    observer = new MutationObserver((mutations) => {
      const shouldScan = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      );
      if (shouldScan) {
        scanAndTransform();
        annotateBacklinkBadges();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    keydownHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") {
        const target = e.target as HTMLElement | null;
        if (!target?.classList.contains("node-editor")) return;
        const nodeId = target.dataset.nodeId;
        if (!nodeId) return;
        e.preventDefault();
        void navigator.clipboard.writeText(`((${nodeId}))`).then(() => {
          showCopyToast(`Copied block reference`);
        });
      }
    };
    document.addEventListener("keydown", keydownHandler);

    ctx.registerCommand({
      id: "copy-block-ref",
      name: "Copy Block Reference",
      shortcut: "Ctrl+Shift+C",
      category: "Navigation",
      keywords: ["block", "reference", "copy", "id", "ref"],
      execute: () => {
        const target = document.activeElement as HTMLElement | null;
        if (!target?.classList.contains("node-editor")) return;
        const nodeId = target.dataset.nodeId;
        if (!nodeId) return;
        void navigator.clipboard.writeText(`((${nodeId}))`).then(() => {
          showCopyToast(`Copied block reference`);
        });
      },
    });

    ctx.registerCommand({
      id: "toggle-block-ref-display",
      name: "Toggle Block Ref Display",
      category: "Navigation",
      keywords: ["block", "reference", "display", "content", "uuid", "toggle"],
      execute: () => {
        refDisplayMode = refDisplayMode === "content" ? "uuid" : "content";
        saveRefDisplayMode();
        scanAndTransform();
        const label = refDisplayMode === "content" ? "Show referenced content" : "Show block ID";
        showCopyToast(`${label}`);
      },
    });

    backlinksPanel = createBacklinksPanel();
    document.body.appendChild(backlinksPanel);

    unsubStore = store.subscribe((state) => {
      if (state.zoomedNodeId !== lastZoomedNodeId) {
        lastZoomedNodeId = state.zoomedNodeId;
        void updateBacklinksPanel(state.zoomedNodeId);
      }
      // Tree re-rendered (new nodes loaded) — refresh badges
      void fetchBacklinkCounts();
    });
    void updateBacklinksPanel(store.getState().zoomedNodeId);

    console.log("[third-party-block-ref] renderer ready");
  },

  async onUnload() {
    removeCSS();
    hideTooltip();

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    if (keydownHandler) {
      document.removeEventListener("keydown", keydownHandler);
      keydownHandler = null;
    }

    if (unsubStore) {
      unsubStore();
      unsubStore = null;
    }
    if (backlinksPanel) {
      backlinksPanel.remove();
      backlinksPanel = null;
    }

    for (const editor of getEditors()) {
      unwrapRefs(editor);
    }

    document.querySelectorAll(".backlink-badge").forEach((el) => el.remove());
  },
};

export default plugin;
