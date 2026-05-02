import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import type { LinkWithNode } from "../../../shared/types";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

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
let observer: MutationObserver | null = null;
let unsubStore: (() => void) | null = null;
let activeNodeId: string | null = null;
let contextMenuEl: HTMLDivElement | null = null;
let modalEl: HTMLDivElement | null = null;
let linksTabPanel: HTMLElement | null = null;
let ctxRef: RendererPluginContext | null = null;

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

/* ─── CSS ─── */

function injectCSS(): void {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}

function removeCSS(): void {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

/* ─── Links tab ─── */

async function refreshLinksTab(container: HTMLElement): Promise<void> {
  const zoomedId = store.getState().zoomedNodeId;
  if (!zoomedId) {
    container.innerHTML = "";
    return;
  }
  activeNodeId = zoomedId;

  const res = await api.getNodeLinks({ node_id: zoomedId });
  if (!res.success) return;

  const links = res.data ?? [];
  const html = buildSidebarContent(links);
  container.innerHTML = html;
  attachSidebarEvents(container);
}

function buildSidebarContent(links: LinkWithNode[]): string {
  const outgoing = links.filter((l) => l.direction === "outgoing");
  const incoming = links.filter((l) => l.direction === "incoming");

  let html = "";

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

function attachSidebarEvents(container: HTMLElement): void {
  // Link item clicks (navigate)
  container.querySelectorAll(".link-item").forEach((item) => {
    item.addEventListener("mousedown", (e) => {
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
  container.querySelectorAll(".link-item-delete").forEach((btn) => {
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
        if (linksTabPanel) void refreshLinksTab(linksTabPanel);
      } else {
        showCopyToast("Failed to delete link");
      }
    });
  });

  // Edit buttons
  container.querySelectorAll(".link-item-edit").forEach((btn) => {
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
      if (linksTabPanel) void refreshLinksTab(linksTabPanel);
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
      if (linksTabPanel) void refreshLinksTab(linksTabPanel);
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
      if (linksTabPanel) void refreshLinksTab(linksTabPanel);
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
    ctxRef = ctx;
    injectCSS();

    // Create tab panel and register on core sidebar
    linksTabPanel = document.createElement("div");
    linksTabPanel.className = "sidebar-tab-panel links-tab";
    linksTabPanel.style.overflowY = "auto";
    linksTabPanel.style.padding = "8px 0";

    await ctx.emit("sidebar:register-tab", {
      pluginId: "third-party-links",
      tabId: "links",
      label: "Links",
      panel: linksTabPanel,
    });

    // Initial render
    void refreshLinksTab(linksTabPanel);

    // Observe DOM for content area changes (search toggle, etc.)
    observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      );
      if (hasNewNodes) {
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
      if (state.zoomedNodeId !== activeNodeId) {
        activeNodeId = state.zoomedNodeId;
        if (linksTabPanel) void refreshLinksTab(linksTabPanel);
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
        void ctx.emit("sidebar:toggle");
        if (linksTabPanel) {
          void ctx.emit("sidebar:show-tab", { tabId: "links" });
        }
      },
    });

    console.log("[third-party-links] renderer ready");
  },

  async onUnload() {
    await ctxRef?.emit("sidebar:unregister-tab", {
      pluginId: "third-party-links",
      tabId: "links",
    });
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

    linksTabPanel?.remove();
    linksTabPanel = null;
    ctxRef = null;
  },
};

export default plugin;
