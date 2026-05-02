import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import type { LinkWithNode } from "../../../shared/types";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

const SIDEBAR_WIDTH_KEY = "mindscape_link_sidebar_width";
const SIDEBAR_OPEN_KEY = "mindscape_link_sidebar_open";

const CSS = `
/* ─── Link badges ─── */
.link-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 9px;
  background: rgba(79, 195, 247, 0.2);
  color: var(--accent, #4fc3f7);
  vertical-align: middle;
  user-select: none;
  flex-shrink: 0;
}

/* ─── Links sidebar ─── */
:root {
  --link-sidebar-width: 320px;
}

.links-sidebar {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: var(--link-sidebar-width);
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

.links-sidebar.open {
  transform: translateX(0);
}

.links-sidebar-resize-handle {
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

.links-sidebar-resize-handle:hover,
.links-sidebar.resizing .links-sidebar-resize-handle {
  background: var(--accent, #4fc3f7);
  opacity: 0.6;
}

.links-sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg, #1a1a2e);
  border-bottom: 1px solid var(--border, #333);
  flex-shrink: 0;
}

.links-sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #e0e0e0);
}

.links-sidebar-count {
  background: rgba(79, 195, 247, 0.2);
  color: var(--accent, #4fc3f7);
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.links-sidebar-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 18px;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}

.links-sidebar-close:hover {
  color: var(--text, #e0e0e0);
  background: var(--focus-bg, rgba(255,255,255,0.05));
}

.links-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.links-section-header {
  padding: 8px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted, #888);
}

.links-empty {
  padding: 20px 14px;
  text-align: center;
  color: var(--text-muted, #888);
  font-size: 12px;
  font-style: italic;
}

.link-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 14px 8px 18px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.1s;
}

.link-item:hover {
  background: var(--focus-bg, rgba(255,255,255,0.05));
  border-left-color: var(--accent, #4fc3f7);
}

.link-item-direction {
  color: var(--accent, #4fc3f7);
  font-size: 14px;
  flex-shrink: 0;
  padding-top: 1px;
}

.link-item-direction.incoming {
  color: #81c784;
}

.link-item-info {
  flex: 1;
  min-width: 0;
}

.link-item-content {
  color: var(--text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.link-item-deleted {
  color: var(--text-muted, #888);
  font-style: italic;
}

.link-item-meta {
  display: flex;
  gap: 10px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-muted, #888);
}

.link-item-category {
  color: var(--accent, #4fc3f7);
  font-weight: 500;
}

.link-item-weight {
  font-family: var(--font-mono, monospace);
}

.link-item-delete {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.1s;
}

.link-item:hover .link-item-delete {
  opacity: 1;
}

.link-item-delete:hover {
  color: #e57373;
}

/* ─── Content push when sidebar open ─── */
.outline-tree.sidebar-active,
.search-results.sidebar-active {
  margin-right: var(--link-sidebar-width);
  transition: margin-right 0.2s ease;
}

/* ─── Link creation / edit modal ─── */
.link-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.link-modal {
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.link-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border, #333);
}

.link-modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #e0e0e0);
}

.link-modal-close {
  background: none;
  border: none;
  color: var(--text-muted, #888);
  font-size: 22px;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 4px;
  line-height: 1;
}

.link-modal-close:hover {
  color: var(--text, #e0e0e0);
}

.link-modal-body {
  padding: 16px 18px;
}

.link-modal-field {
  margin-bottom: 14px;
}

.link-modal-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, #888);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.link-modal-field input[type="text"],
.link-modal-field input[type="number"] {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border, #333);
  background: var(--bg, #1a1a2e);
  color: var(--text, #e0e0e0);
  font-size: 14px;
  outline: none;
  font-family: inherit;
}

.link-modal-field input:focus {
  border-color: var(--accent, #4fc3f7);
}

.link-source-display {
  padding: 8px 10px;
  background: var(--bg, #1a1a2e);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  color: var(--text-muted, #888);
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-target-search-results {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  margin-top: 4px;
  background: var(--bg, #1a1a2e);
}

.link-target-result {
  padding: 7px 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text, #e0e0e0);
  border-bottom: 1px solid var(--border, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.link-target-result:last-child {
  border-bottom: none;
}

.link-target-result:hover,
.link-target-result.selected {
  background: var(--focus-bg, rgba(255,255,255,0.05));
  color: var(--accent, #4fc3f7);
}

.link-modal-field-row {
  display: flex;
  gap: 12px;
}

.link-modal-field-row > .link-modal-field {
  flex: 1;
  margin-bottom: 0;
}

.link-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border, #333);
}

.link-modal-actions .btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.link-modal-actions .btn-primary {
  background: var(--accent, #4fc3f7);
  color: #000;
}

.link-modal-actions .btn-primary:hover {
  background: var(--accent-hover, #81d4fa);
}

.link-modal-actions .btn-secondary {
  background: transparent;
  color: var(--text-muted, #888);
  border: 1px solid var(--border, #333);
}

.link-modal-actions .btn-secondary:hover {
  background: var(--focus-bg, rgba(255,255,255,0.05));
  color: var(--text, #e0e0e0);
}

.link-modal-error {
  margin: 0 18px 12px;
  padding: 8px 12px;
  font-size: 13px;
  color: #e57373;
  background: rgba(229, 115, 115, 0.1);
  border-radius: 6px;
}

/* ─── Context menu ─── */
.context-menu {
  position: fixed;
  z-index: 2000;
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 220px;
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

/* ─── Edit link panel in sidebar ─── */
.link-item-edit {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted, #888);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  border-radius: 3px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.1s;
}

.link-item:hover .link-item-edit {
  opacity: 1;
}

.link-item-edit:hover {
  color: var(--accent, #4fc3f7);
}
`;

let styleEl: HTMLStyleElement | null = null;
let sidebar: HTMLDivElement | null = null;
let observer: MutationObserver | null = null;
let unsubStore: (() => void) | null = null;
let sidebarOpen = false;
let sidebarWidth = 320;
let activeNodeId: string | null = null;
let contextMenuEl: HTMLDivElement | null = null;
let modalEl: HTMLDivElement | null = null;
let sidebarLastHTML = "";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

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

/* ─── Persistence ─── */

function loadSidebarPrefs(): void {
  try {
    sidebarOpen = localStorage.getItem(SIDEBAR_OPEN_KEY) === "1";
    const w = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (w) {
      const n = parseInt(w, 10);
      if (n >= 200 && n <= 600) sidebarWidth = n;
    }
  } catch {
    /* ignore */
  }
}

function saveSidebarPrefs(): void {
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, sidebarOpen ? "1" : "0");
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  } catch {
    /* ignore */
  }
}

/* ─── CSS ─── */

function injectCSS(): void {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
  document.documentElement.style.setProperty("--link-sidebar-width", `${sidebarWidth}px`);
}

function removeCSS(): void {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

/* ─── Sidebar ─── */

function createSidebar(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "links-sidebar";
  if (sidebarOpen) el.classList.add("open");

  // Resize handle
  const handle = document.createElement("div");
  handle.className = "links-sidebar-resize-handle";
  el.appendChild(handle);

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = sidebarWidth;
    el.classList.add("resizing");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    const newWidth = Math.min(600, Math.max(200, startWidth + delta));
    sidebarWidth = newWidth;
    document.documentElement.style.setProperty("--link-sidebar-width", `${newWidth}px`);
  });

  document.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      el.classList.remove("resizing");
      saveSidebarPrefs();
    }
  });

  return el;
}

function buildSidebarContent(links: LinkWithNode[], nodeId: string): string {
  const outgoing = links.filter((l) => l.direction === "outgoing");
  const incoming = links.filter((l) => l.direction === "incoming");
  const total = links.length;

  let html = `
    <div class="links-sidebar-header">
      <span class="links-sidebar-title">Links</span>
      <span class="links-sidebar-count">${total}</span>
      <button class="links-sidebar-close" title="Close sidebar">&times;</button>
    </div>
    <div class="links-sidebar-body">`;

  if (outgoing.length > 0) {
    html += `<div class="links-section-header">Outgoing (${outgoing.length})</div>`;
    for (const link of outgoing) {
      html += buildLinkItemHTML(link, "outgoing");
    }
  }

  if (incoming.length > 0) {
    html += `<div class="links-section-header">Incoming (${incoming.length})</div>`;
    for (const link of incoming) {
      html += buildLinkItemHTML(link, "incoming");
    }
  }

  if (links.length === 0) {
    html += `<div class="links-empty">No links for this node.<br/>Right-click a bullet and choose "Create link" to add one.</div>`;
  }

  html += `</div>`;
  return html;
}

function buildLinkItemHTML(link: LinkWithNode, dir: string): string {
  const arrow = dir === "outgoing" ? "&#8594;" : "&#8592;";
  const dirClass = dir === "incoming" ? "incoming" : "";
  const content = link.other_node
    ? escapeHtml(link.other_node.content || "(empty)")
    : '<span class="link-item-deleted">(deleted)</span>';
  const category = link.category
    ? `<span class="link-item-category">${escapeHtml(link.category)}</span>`
    : "";
  const weight = `<span class="link-item-weight">${link.weight.toFixed(2)}</span>`;

  return `
    <div class="link-item" data-link-id="${link.id}" data-other-id="${link.other_node?.id || ""}">
      <span class="link-item-direction ${dirClass}">${arrow}</span>
      <div class="link-item-info">
        <div class="link-item-content">${content}</div>
        <div class="link-item-meta">${category}${category && weight ? " " : ""}${weight}</div>
      </div>
      <button class="link-item-edit" title="Edit link properties">&#9998;</button>
      <button class="link-item-delete" title="Delete link">&times;</button>
    </div>`;
}

function attachSidebarEvents(): void {
  if (!sidebar) return;

  // Close button
  const closeBtn = sidebar.querySelector(".links-sidebar-close");
  if (closeBtn) {
    closeBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      toggleSidebar(false);
    });
  }

  // Link item clicks (navigate)
  sidebar.querySelectorAll(".link-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      // Don't navigate if clicking delete or edit buttons
      const target = e.target as HTMLElement;
      if (target.closest(".link-item-delete") || target.closest(".link-item-edit")) return;

      const otherId = (item as HTMLElement).dataset.otherId;
      if (otherId) {
        e.preventDefault();
        void store.zoomIn(otherId);
      }
    });
  });

  // Delete buttons
  sidebar.querySelectorAll(".link-item-delete").forEach((btn) => {
    btn.addEventListener("mousedown", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const item = (btn as HTMLElement).closest(".link-item") as HTMLElement;
      if (!item) return;
      const linkId = item.dataset.linkId;
      if (!linkId) return;

      const res = await api.deleteLink(linkId);
      if (res.success) {
        showCopyToast("Link deleted");
        void refreshSidebar();
      } else {
        showCopyToast("Failed to delete link");
      }
    });
  });

  // Edit buttons
  sidebar.querySelectorAll(".link-item-edit").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const item = (btn as HTMLElement).closest(".link-item") as HTMLElement;
      if (!item) return;
      const linkId = item.dataset.linkId;
      if (!linkId) return;
      void openEditModal(linkId);
    });
  });
}

async function refreshSidebar(): Promise<void> {
  if (!sidebar || !sidebarOpen) return;
  const zoomedId = store.getState().zoomedNodeId;
  if (!zoomedId) {
    sidebar.style.display = "none";
    return;
  }
  sidebar.style.display = "flex";
  activeNodeId = zoomedId;

  const res = await api.getNodeLinks({ node_id: zoomedId });
  if (!res.success) return;

  const links = res.data ?? [];
  const html = buildSidebarContent(links, zoomedId);

  if (html === sidebarLastHTML) return;
  sidebarLastHTML = html;
  sidebar.innerHTML = "";
  // Re-add resize handle
  const handle = document.createElement("div");
  handle.className = "links-sidebar-resize-handle";
  sidebar.appendChild(handle);
  // Re-add resize logic
  const s = sidebar;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = sidebarWidth;
    s.classList.add("resizing");
    e.preventDefault();
  });

  const onMove = (e: MouseEvent) => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    sidebarWidth = Math.min(600, Math.max(200, startWidth + delta));
    document.documentElement.style.setProperty("--link-sidebar-width", `${sidebarWidth}px`);
  };
  const onUp = () => {
    if (dragging) {
      dragging = false;
      s.classList.remove("resizing");
      saveSidebarPrefs();
    }
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);

  // Add inner HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const bodyChildren = doc.body.childNodes;
  while (bodyChildren.length > 0) {
    sidebar.appendChild(bodyChildren[0]);
  }

  attachSidebarEvents();
}

function toggleSidebar(open?: boolean): void {
  if (typeof open !== "boolean") open = !sidebarOpen;
  sidebarOpen = open;
  saveSidebarPrefs();

  if (!sidebar) return;

  if (sidebarOpen) {
    sidebar.classList.add("open");
    applyContentPush(true);
    updateSidebarTop();
    void refreshSidebar();
  } else {
    sidebar.classList.remove("open");
    applyContentPush(false);
  }
  sidebar.style.display = sidebarOpen ? "flex" : "none";
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

function updateSidebarTop(): void {
  if (!sidebar) return;
  const toolbar = document.querySelector<HTMLElement>(".toolbar");
  const breadcrumb = document.querySelector<HTMLElement>(".breadcrumb-container");
  const top = (toolbar?.offsetHeight || 0) + ((breadcrumb?.offsetHeight || 0) + 1);
  sidebar.style.top = `${top}px`;
}

/* ─── Link creation / edit modal ─── */

async function openCreateModal(sourceId: string): Promise<void> {
  destroyModal();
  const sourceNode = await api.getNode(sourceId);
  const sourceContent = sourceNode.data?.content || "(empty)";

  modalEl = document.createElement("div");
  modalEl.className = "link-modal-overlay";

  modalEl.innerHTML = `
    <div class="link-modal">
      <div class="link-modal-header">
        <h3>Create Link</h3>
        <button class="link-modal-close">&times;</button>
      </div>
      <div class="link-modal-body">
        <div class="link-modal-field">
          <label>Source</label>
          <div class="link-source-display">${escapeHtml(sourceContent)}</div>
        </div>
        <div class="link-modal-field">
          <label>Target</label>
          <input type="text" class="link-target-search" placeholder="Search for a target node..." autocomplete="off" />
          <div class="link-target-search-results" style="display:none"></div>
        </div>
        <div class="link-modal-field-row">
          <div class="link-modal-field">
            <label>Category</label>
            <input type="text" class="link-category" placeholder="e.g. supports, relates-to" />
          </div>
          <div class="link-modal-field">
            <label>Weight (0–10)</label>
            <input type="number" class="link-weight" value="1.00" min="0" max="10" step="0.01" />
          </div>
        </div>
      </div>
      <div class="link-modal-actions">
        <button class="btn btn-secondary link-modal-cancel">Cancel</button>
        <button class="btn btn-primary link-modal-create" disabled>Create Link</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  // Close on overlay click
  modalEl.addEventListener("mousedown", (e) => {
    if (e.target === modalEl) destroyModal();
  });

  const closeBtn = modalEl.querySelector(".link-modal-close");
  const cancelBtn = modalEl.querySelector(".link-modal-cancel");
  const createBtn = modalEl.querySelector(".link-modal-create") as HTMLButtonElement;
  const targetInput = modalEl.querySelector(".link-target-search") as HTMLInputElement;
  const categoryInput = modalEl.querySelector(".link-category") as HTMLInputElement;
  const weightInput = modalEl.querySelector(".link-weight") as HTMLInputElement;
  const resultsEl = modalEl.querySelector(".link-target-search-results") as HTMLDivElement;

  closeBtn?.addEventListener("mousedown", () => destroyModal());
  cancelBtn?.addEventListener("mousedown", () => destroyModal());

  // Escape to close
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") destroyModal();
  };
  document.addEventListener("keydown", onKey);
  (modalEl as any).__onKey = onKey;

  let selectedTargetId: string | null = null;
  let selectedIndex = -1;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  targetInput.addEventListener("input", () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const q = targetInput.value.trim();
    if (!q) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
      selectedTargetId = null;
      selectedIndex = -1;
      createBtn.disabled = true;
      return;
    }
    searchTimeout = setTimeout(async () => {
      const res = await api.search({ query: q, limit: 8 });
      if (!res.success || !res.data) return;
      const nodes = res.data;
      selectedIndex = -1;
      selectedTargetId = null;
      createBtn.disabled = true;
      resultsEl.innerHTML = nodes
        .map(
          (n, idx) =>
            `<div class="link-target-result" data-index="${idx}" data-id="${n.id}">${escapeHtml(n.content || "(empty)")}</div>`
        )
        .join("");
      resultsEl.style.display = nodes.length > 0 ? "block" : "none";
    }, 150);
  });

  resultsEl.addEventListener("mousedown", (e) => {
    const item = (e.target as HTMLElement).closest(".link-target-result") as HTMLElement | null;
    if (!item) return;
    e.preventDefault();
    selectedTargetId = item.dataset.id || null;
    targetInput.value = item.textContent || "";
    resultsEl.style.display = "none";
    createBtn.disabled = !selectedTargetId;
  });

  targetInput.addEventListener("keydown", (e) => {
    const items = resultsEl.querySelectorAll(".link-target-result");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex + 1) % items.length;
      updateSearchSelection(items, selectedIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSearchSelection(items, selectedIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        const item = items[selectedIndex] as HTMLElement;
        selectedTargetId = item.dataset.id || null;
        targetInput.value = item.textContent || "";
        resultsEl.style.display = "none";
        createBtn.disabled = !selectedTargetId;
      }
    }
  });

  createBtn.addEventListener("mousedown", async () => {
    if (!selectedTargetId) return;
    const category = categoryInput.value.trim();
    const weightStr = weightInput.value.trim();
    const weight = weightStr ? parseFloat(weightStr) : undefined;

    const existingError = modalEl?.querySelector(".link-modal-error");
    if (existingError) existingError.remove();

    const res = await api.createLink({
      source_id: sourceId,
      target_id: selectedTargetId,
      category: category || undefined,
      weight,
    });

    if (res.success) {
      destroyModal();
      showCopyToast("Link created");
      void refreshLinkCounts();
      void refreshSidebar();
    } else {
      const errDiv = document.createElement("div");
      errDiv.className = "link-modal-error";
      errDiv.textContent = res.error || "Failed to create link";
      modalEl?.querySelector(".link-modal")?.insertBefore(
        errDiv,
        modalEl.querySelector(".link-modal-actions")
      );
    }
  });

  targetInput.focus();
}

async function openEditModal(linkId: string): Promise<void> {
  // Fetch existing links to find this one
  const zoomedId = store.getState().zoomedNodeId;
  if (!zoomedId) return;
  const res = await api.getNodeLinks({ node_id: zoomedId });
  if (!res.success || !res.data) return;
  const link = res.data.find((l) => l.id === linkId);
  if (!link) return;

  destroyModal();

  const otherContent = link.other_node?.content || "(deleted)";

  modalEl = document.createElement("div");
  modalEl.className = "link-modal-overlay";

  modalEl.innerHTML = `
    <div class="link-modal">
      <div class="link-modal-header">
        <h3>Edit Link</h3>
        <button class="link-modal-close">&times;</button>
      </div>
      <div class="link-modal-body">
        <div class="link-modal-field">
          <label>${link.direction === "outgoing" ? "Links to" : "Linked from"}</label>
          <div class="link-source-display">${escapeHtml(otherContent)}</div>
        </div>
        <div class="link-modal-field-row">
          <div class="link-modal-field">
            <label>Category</label>
            <input type="text" class="link-category" placeholder="e.g. supports, relates-to" value="${escapeHtml(link.category)}" />
          </div>
          <div class="link-modal-field">
            <label>Weight (0–10)</label>
            <input type="number" class="link-weight" value="${link.weight.toFixed(2)}" min="0" max="10" step="0.01" />
          </div>
        </div>
      </div>
      <div class="link-modal-actions">
        <button class="btn btn-secondary link-modal-cancel">Cancel</button>
        <button class="btn btn-primary link-modal-save">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  modalEl.addEventListener("mousedown", (e) => {
    if (e.target === modalEl) destroyModal();
  });

  const closeBtn = modalEl.querySelector(".link-modal-close");
  const cancelBtn = modalEl.querySelector(".link-modal-cancel");
  const saveBtn = modalEl.querySelector(".link-modal-save") as HTMLButtonElement;
  const categoryInput = modalEl.querySelector(".link-category") as HTMLInputElement;
  const weightInput = modalEl.querySelector(".link-weight") as HTMLInputElement;

  closeBtn?.addEventListener("mousedown", () => destroyModal());
  cancelBtn?.addEventListener("mousedown", () => destroyModal());

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") destroyModal();
  };
  document.addEventListener("keydown", onKey);
  (modalEl as any).__onKey = onKey;

  saveBtn.addEventListener("mousedown", async () => {
    const category = categoryInput.value.trim();
    const weightStr = weightInput.value.trim();
    const weight = weightStr ? parseFloat(weightStr) : undefined;

    const res = await api.updateLink({
      id: linkId,
      category: category || undefined,
      weight,
    });

    if (res.success) {
      destroyModal();
      showCopyToast("Link updated");
      void refreshSidebar();
    } else {
      const errDiv = document.createElement("div");
      errDiv.className = "link-modal-error";
      errDiv.textContent = res.error || "Failed to update link";
      modalEl?.querySelector(".link-modal")?.insertBefore(
        errDiv,
        modalEl.querySelector(".link-modal-actions")
      );
    }
  });
}

function destroyModal(): void {
  if (!modalEl) return;
  const onKey = (modalEl as any).__onKey;
  if (onKey) document.removeEventListener("keydown", onKey);
  modalEl.remove();
  modalEl = null;
}

function updateSearchSelection(items: NodeListOf<Element>, idx: number): void {
  items.forEach((item, i) => {
    if (i === idx) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
    }
  });
}

/* ─── Context menu ─── */

function destroyContextMenu(): void {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

function showContextMenu(x: number, y: number, nodeId: string): void {
  destroyContextMenu();

  contextMenuEl = document.createElement("div");
  contextMenuEl.className = "context-menu";

  contextMenuEl.innerHTML = `
    <div class="context-menu-item" data-action="copy-ref">
      Copy block reference ((id)) <kbd>Ctrl+Shift+C</kbd>
    </div>
    <div class="context-menu-divider"></div>
    <div class="context-menu-item" data-action="link-from">
      Create link from here &#8594;
    </div>
    <div class="context-menu-item" data-action="link-to">
      Create link to here &#8592;
    </div>
  `;

  // Position
  const menuWidth = 260;
  const menuHeight = 120; // approximate
  let px = x;
  let py = y;
  if (px + menuWidth > window.innerWidth) px = window.innerWidth - menuWidth - 8;
  if (py + menuHeight > window.innerHeight) py = window.innerHeight - menuHeight - 8;
  contextMenuEl.style.left = `${px}px`;
  contextMenuEl.style.top = `${py}px`;

  document.body.appendChild(contextMenuEl);

  // Click actions
  contextMenuEl.querySelectorAll(".context-menu-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = (item as HTMLElement).dataset.action;
      if (action === "copy-ref") {
        void navigator.clipboard.writeText(`((${nodeId}))`).then(() => {
          showCopyToast("Copied block reference");
        });
      } else if (action === "link-from") {
        void openCreateModal(nodeId);
      } else if (action === "link-to") {
        // "Link to here" = current node is the target, need to pick source
        // For simplicity, reverse: set the focused node as target and prompt for source
        void openCreateModalWithTarget(nodeId);
      }
      destroyContextMenu();
    });
  });

  // Dismiss on click outside or Escape
  const dismiss = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== "Escape") return;
    if (e instanceof MouseEvent && contextMenuEl?.contains(e.target as Node)) return;
    destroyContextMenu();
    document.removeEventListener("mousedown", dismiss, true);
    document.removeEventListener("keydown", dismiss);
  };
  setTimeout(() => {
    // Delayed to avoid the triggering mousedown from also dismissing
    document.addEventListener("mousedown", dismiss, true);
    document.addEventListener("keydown", dismiss);
  }, 0);
}

async function openCreateModalWithTarget(targetId: string): Promise<void> {
  // Let user pick source, treat current clicked node as target
  destroyModal();
  const targetNode = await api.getNode(targetId);
  const targetContent = targetNode.data?.content || "(empty)";

  modalEl = document.createElement("div");
  modalEl.className = "link-modal-overlay";

  modalEl.innerHTML = `
    <div class="link-modal">
      <div class="link-modal-header">
        <h3>Create Link</h3>
        <button class="link-modal-close">&times;</button>
      </div>
      <div class="link-modal-body">
        <div class="link-modal-field">
          <label>Source (will link to target)</label>
          <input type="text" class="link-target-search" placeholder="Search for a source node..." autocomplete="off" />
          <div class="link-target-search-results" style="display:none"></div>
        </div>
        <div class="link-modal-field">
          <label>Target</label>
          <div class="link-source-display">${escapeHtml(targetContent)}</div>
        </div>
        <div class="link-modal-field-row">
          <div class="link-modal-field">
            <label>Category</label>
            <input type="text" class="link-category" placeholder="e.g. supports, relates-to" />
          </div>
          <div class="link-modal-field">
            <label>Weight (0–10)</label>
            <input type="number" class="link-weight" value="1.00" min="0" max="10" step="0.01" />
          </div>
        </div>
      </div>
      <div class="link-modal-actions">
        <button class="btn btn-secondary link-modal-cancel">Cancel</button>
        <button class="btn btn-primary link-modal-create" disabled>Create Link</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  modalEl.addEventListener("mousedown", (e) => {
    if (e.target === modalEl) destroyModal();
  });

  const closeBtn = modalEl.querySelector(".link-modal-close");
  const cancelBtn = modalEl.querySelector(".link-modal-cancel");
  const createBtn = modalEl.querySelector(".link-modal-create") as HTMLButtonElement;
  const sourceInput = modalEl.querySelector(".link-target-search") as HTMLInputElement;
  const categoryInput = modalEl.querySelector(".link-category") as HTMLInputElement;
  const weightInput = modalEl.querySelector(".link-weight") as HTMLInputElement;
  const resultsEl = modalEl.querySelector(".link-target-search-results") as HTMLDivElement;

  closeBtn?.addEventListener("mousedown", () => destroyModal());
  cancelBtn?.addEventListener("mousedown", () => destroyModal());

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") destroyModal();
  };
  document.addEventListener("keydown", onKey);
  (modalEl as any).__onKey = onKey;

  let selectedSourceId: string | null = null;
  let selectedIndex = -1;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  sourceInput.addEventListener("input", () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const q = sourceInput.value.trim();
    if (!q) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
      selectedSourceId = null;
      selectedIndex = -1;
      createBtn.disabled = true;
      return;
    }
    searchTimeout = setTimeout(async () => {
      const res = await api.search({ query: q, limit: 8 });
      if (!res.success || !res.data) return;
      const nodes = res.data;
      selectedIndex = -1;
      selectedSourceId = null;
      createBtn.disabled = true;
      resultsEl.innerHTML = nodes
        .map(
          (n, idx) =>
            `<div class="link-target-result" data-index="${idx}" data-id="${n.id}">${escapeHtml(n.content || "(empty)")}</div>`
        )
        .join("");
      resultsEl.style.display = nodes.length > 0 ? "block" : "none";
    }, 150);
  });

  resultsEl.addEventListener("mousedown", (e) => {
    const item = (e.target as HTMLElement).closest(".link-target-result") as HTMLElement | null;
    if (!item) return;
    e.preventDefault();
    selectedSourceId = item.dataset.id || null;
    sourceInput.value = item.textContent || "";
    resultsEl.style.display = "none";
    createBtn.disabled = !selectedSourceId;
  });

  sourceInput.addEventListener("keydown", (e) => {
    const items = resultsEl.querySelectorAll(".link-target-result");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex + 1) % items.length;
      updateSearchSelection(items, selectedIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSearchSelection(items, selectedIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        const item = items[selectedIndex] as HTMLElement;
        selectedSourceId = item.dataset.id || null;
        sourceInput.value = item.textContent || "";
        resultsEl.style.display = "none";
        createBtn.disabled = !selectedSourceId;
      }
    }
  });

  createBtn.addEventListener("mousedown", async () => {
    if (!selectedSourceId) return;
    const category = categoryInput.value.trim();
    const weightStr = weightInput.value.trim();
    const weight = weightStr ? parseFloat(weightStr) : undefined;

    const existingError = modalEl?.querySelector(".link-modal-error");
    if (existingError) existingError.remove();

    const res = await api.createLink({
      source_id: selectedSourceId,
      target_id: targetId,
      category: category || undefined,
      weight,
    });

    if (res.success) {
      destroyModal();
      showCopyToast("Link created");
      void refreshLinkCounts();
      void refreshSidebar();
    } else {
      const errDiv = document.createElement("div");
      errDiv.className = "link-modal-error";
      errDiv.textContent = res.error || "Failed to create link";
      modalEl?.querySelector(".link-modal")?.insertBefore(
        errDiv,
        modalEl.querySelector(".link-modal-actions")
      );
    }
  });

  sourceInput.focus();
}

/* ─── Link count badges ─── */

let lastLinkCounts: Record<string, { total: number; outgoing: number; incoming: number }> = {};
let annotatingLinks = false;

async function refreshLinkCounts(): Promise<void> {
  const res = await api.getLinkCounts();
  if (res.success && res.data) {
    lastLinkCounts = res.data;
  }
  annotateLinkBadges();
}

function annotateLinkBadges(): void {
  if (annotatingLinks) return;
  annotatingLinks = true;
  try {
    const nodes = document.querySelectorAll<HTMLElement>(".outline-node[data-node-id]");
    for (const nodeEl of nodes) {
      const nodeId = nodeEl.dataset.nodeId;
      if (!nodeId) continue;

      const count = lastLinkCounts[nodeId]?.total ?? 0;

      const nodeRow = nodeEl.querySelector<HTMLElement>(".node-row");
      if (!nodeRow) continue;

      let badge = nodeRow.querySelector<HTMLElement>(".link-badge");
      if (count > 0) {
        if (badge) {
          if (badge.textContent !== String(count)) {
            badge.textContent = String(count);
          }
        } else {
          badge = document.createElement("span");
          badge.className = "link-badge";
          badge.textContent = String(count);
          nodeRow.appendChild(badge);
        }
      } else {
        if (badge) badge.remove();
      }
    }
  } finally {
    annotatingLinks = false;
  }
}

function removeAllLinkBadges(): void {
  document.querySelectorAll(".link-badge").forEach((el) => el.remove());
}

/* ─── Plugin ─── */

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    loadSidebarPrefs();
    injectCSS();

    // Create sidebar
    sidebar = createSidebar();
    document.body.appendChild(sidebar);
    updateSidebarTop();

    if (sidebarOpen) {
      sidebar.classList.add("open");
      applyContentPush(true);
      void refreshSidebar();
    }

    // Observe DOM for content area changes (search toggle, etc.)
    observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      );
      if (hasNewNodes) {
        updateSidebarTop();
        applyContentPush(sidebarOpen);
        requestAnimationFrame(() => annotateLinkBadges());
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Context menu: intercept right-click on bullets (capture phase)
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
        showContextMenu(e.clientX, e.clientY, nodeId);
      },
      true
    );

    // Store subscription
    unsubStore = store.subscribe((state) => {
      updateSidebarTop();
      if (state.zoomedNodeId !== activeNodeId) {
        activeNodeId = state.zoomedNodeId;
        if (sidebarOpen) {
          void refreshSidebar();
        }
      }
      requestAnimationFrame(() => annotateLinkBadges());
    });

    // Fetch initial link counts
    void refreshLinkCounts();

    // Register commands
    ctx.registerCommand({
      id: "link-create",
      name: "Create Link",
      category: "Links",
      keywords: ["link", "connect", "edge", "relation"],
      execute: () => {
        const state = store.getState();
        const sourceId = state.focusedNodeId || state.zoomedNodeId;
        if (!sourceId) {
          showCopyToast("Focus on a node first to create a link");
          return;
        }
        void openCreateModal(sourceId);
      },
    });

    ctx.registerCommand({
      id: "link-sidebar-toggle",
      name: "Toggle Links Sidebar",
      category: "Links",
      keywords: ["link", "sidebar", "toggle", "panel"],
      execute: () => {
        toggleSidebar();
      },
    });

    console.log("[third-party-links] renderer ready");
  },

  async onUnload() {
    removeCSS();
    removeAllLinkBadges();
    destroyContextMenu();
    destroyModal();

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (unsubStore) {
      unsubStore();
      unsubStore = null;
    }

    applyContentPush(false);

    if (sidebar) {
      sidebar.remove();
      sidebar = null;
    }
  },
};

export default plugin;
