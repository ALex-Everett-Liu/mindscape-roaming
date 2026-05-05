import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";

const HINT_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"] as const;

type HintType = "node" | "crumb" | "panel";

interface HintEntry {
  el: HTMLElement;
  label: string;
  nodeId: string;
  type: HintType;
}

interface CrumbTarget {
  el: HTMLElement;
  nodeId: string;
  isHome: boolean;
}

let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;
let navMode = false;
let navModeType: "edit" | "focus" = "edit";
let hintMap = new Map<string, HintEntry>();
let keyBuffer = "";
let statusBar: HTMLElement | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let hintElements: HTMLElement[] = [];

// ─── Debug logging ────────────────────────────────
const debugLogs: string[] = [];
function logDebug(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  debugLogs.push(line);
}

const CSS = `
.vim-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 17px;
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #1a1a1a;
  background: #ffd700;
  border: 1px solid #e6c200;
  border-radius: 3px;
  padding: 0 3px;
  flex-shrink: 0;
  align-self: center;
  margin-right: 2px;
  opacity: 0.95;
  transition: opacity 0.1s;
  user-select: none;
  -webkit-user-select: none;
}
.vim-hint.crumb {
  color: #1a1a1a;
  background: #89b4fa;
  border: 1px solid #74a8e8;
}
.vim-hint.panel {
  color: #1a1a1a;
  background: #a6e3a1;
  border: 1px solid #89d48e;
}
.vim-hint.selected {
  box-shadow: 0 0 0 2px #a6e3a1;
  transform: scale(1.1);
}
.vim-hint.dim {
  opacity: 0.25;
}
.vim-nav-status {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: #1e1e2e;
  border-top: 1px solid #3a3a5c;
  color: #cdd6f4;
  font-family: monospace;
  font-size: 13px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  z-index: 9999;
  gap: 8px;
}
.vim-nav-status .vim-nav-buffer {
  color: #89b4fa;
  font-weight: 700;
}
.vim-nav-status .vim-nav-mode {
  color: #f9e2af;
  font-weight: 700;
  min-width: 90px;
}
.vim-nav-status .vim-nav-cursor {
  display: inline-block;
  width: 8px;
  height: 14px;
  background: #89b4fa;
  animation: vim-cursor-blink 1s step-end infinite;
}
@keyframes vim-cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.vim-nav-status .vim-nav-count {
  color: #a6adc8;
}
.vim-nav-status .vim-nav-confirm {
  color: #a6e3a1;
}
.vim-nav-status .vim-nav-error {
  color: #f38ba8;
}
`;

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

function generateHintLabels(count: number): string[] {
  const labels: string[] = [];

  for (let len = 1; labels.length < count; len++) {
    const combos = buildCombos(len);
    for (const c of combos) {
      labels.push(c);
      if (labels.length >= count) break;
    }
  }

  return labels;
}

function buildCombos(length: number): string[] {
  if (length === 1) return [...HINT_KEYS];

  const result: string[] = [];
  const shorter = buildCombos(length - 1);
  for (const prefix of shorter) {
    for (const key of HINT_KEYS) {
      result.push(prefix + key);
    }
  }
  return result;
}

function getCrumbElements(): CrumbTarget[] {
  const results: CrumbTarget[] = [];

  const homeBtn = document.querySelector<HTMLElement>(".breadcrumb-home");
  if (homeBtn) {
    results.push({ el: homeBtn, nodeId: "__home__", isHome: true });
  }

  const crumbItems = document.querySelectorAll<HTMLElement>(
    ".breadcrumb-item[data-node-id]"
  );
  for (const el of crumbItems) {
    const nodeId = el.dataset.nodeId;
    if (nodeId) {
      results.push({ el, nodeId, isHome: false });
    }
  }

  return results;
}

function getPanelElements(): CrumbTarget[] {
  const results: CrumbTarget[] = [];

  const items = document.querySelectorAll<HTMLElement>(
    ".page-ancestor-item"
  );
  for (const el of items) {
    const action = el.dataset.action;
    const nodeId = el.dataset.nodeId;
    if (action === "zoom-root" && !nodeId) {
      results.push({ el, nodeId: "__zoom_root__", isHome: true });
    } else if (nodeId) {
      results.push({ el, nodeId, isHome: false });
    }
  }

  return results;
}

function getNodeElements(): HTMLElement[] {
  const all = document.querySelectorAll<HTMLElement>(
    ".outline-node[data-node-id]"
  );
  const results: HTMLElement[] = [];
  for (const el of all) {
    const nodeId = el.dataset.nodeId;
    if (nodeId) results.push(el);
  }
  return results;
}

function injectHint(el: HTMLElement, label: string, type: HintType): HTMLElement {
  const hintEl = document.createElement("span");
  const typeClass = type === "node" ? "" : type;
  hintEl.className = `vim-hint ${typeClass}`.trim();
  hintEl.textContent = label;
  hintEl.dataset.vimHint = label;

  if (type === "node") {
    const row = el.querySelector<HTMLElement>(":scope > .node-row");
    if (row) {
      row.insertBefore(hintEl, row.firstChild);
    } else {
      el.insertBefore(hintEl, el.firstChild);
    }
  } else {
    el.insertBefore(hintEl, el.firstChild);
  }

  return hintEl;
}

function assignHints(
  crumbs: CrumbTarget[],
  panels: CrumbTarget[],
  nodes: HTMLElement[]
): Map<string, HintEntry> {
  const total = crumbs.length + panels.length + nodes.length;
  const labels = generateHintLabels(total);
  const map = new Map<string, HintEntry>();
  hintElements = [];

  let i = 0;

  for (const crumb of crumbs) {
    const label = labels[i++];
    const entry: HintEntry = {
      el: crumb.el,
      label,
      nodeId: crumb.nodeId,
      type: "crumb",
    };
    map.set(label, entry);
    const hintEl = injectHint(crumb.el, label, "crumb");
    hintElements.push(hintEl);
  }

  for (const panel of panels) {
    const label = labels[i++];
    const entry: HintEntry = {
      el: panel.el,
      label,
      nodeId: panel.nodeId,
      type: "panel",
    };
    map.set(label, entry);
    const hintEl = injectHint(panel.el, label, "panel");
    hintElements.push(hintEl);
  }

  for (const node of nodes) {
    const label = labels[i++];
    const nodeId = node.dataset.nodeId!;
    const entry: HintEntry = { el: node, label, nodeId, type: "node" };
    map.set(label, entry);
    const hintEl = injectHint(node, label, "node");
    hintElements.push(hintEl);
  }

  return map;
}

function removeAllHints(): void {
  for (const el of hintElements) {
    el.remove();
  }
  hintElements = [];
}

function showStatusBar(): void {
  if (statusBar) return;
  statusBar = document.createElement("div");
  statusBar.className = "vim-nav-status";
  statusBar.innerHTML = `
    <span class="vim-nav-mode"></span>
    <span class="vim-nav-buffer"><span class="vim-nav-text"></span><span class="vim-nav-cursor"></span></span>
    <span class="vim-nav-count"></span>
    <span class="vim-nav-confirm"></span>
    <span class="vim-nav-hint"></span>
  `;
  statusBar.style.display = "none";
  document.body.appendChild(statusBar);
}

function getMatchingHints(): HintEntry[] {
  if (!keyBuffer) return Array.from(hintMap.values());
  const results: HintEntry[] = [];
  for (const [label, entry] of hintMap) {
    if (label.startsWith(keyBuffer)) {
      results.push(entry);
    }
  }
  return results;
}

function hasLongerHintsFor(prefix: string): boolean {
  for (const [label] of hintMap) {
    if (label.length > prefix.length && label.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function updateHintDimming(): void {
  const allMatching = getMatchingHints();
  const matchingSet = new Set(allMatching.map((h) => h.label));

  // Find the single exact match (if buffer matches exactly and needs Enter)
  const exactMatch = hintMap.has(keyBuffer) ? hintMap.get(keyBuffer)! : null;
  const needsEnter = exactMatch && hasLongerHintsFor(keyBuffer);

  for (const [label, entry] of hintMap) {
    const hintEl = findHintElement(entry.el, label);
    if (!hintEl) continue;

    if (!keyBuffer) {
      hintEl.classList.remove("dim", "selected");
    } else {
      hintEl.classList.toggle("dim", !matchingSet.has(label));

      // Highlight the exact match that needs Enter
      if (needsEnter && label === exactMatch!.label) {
        hintEl.classList.add("selected");
      } else {
        hintEl.classList.remove("selected");
      }
    }
  }
}

function findHintElement(
  parentEl: HTMLElement,
  label: string
): HTMLElement | null {
  return parentEl.querySelector<HTMLElement>(
    `.vim-hint[data-vim-hint="${label}"]`
  );
}

function updateStatusBar(): void {
  if (!statusBar) return;
  statusBar.style.display = "";

  const modeEl = statusBar.querySelector(".vim-nav-mode");
  const textEl = statusBar.querySelector(".vim-nav-text");
  const cursorEl = statusBar.querySelector(".vim-nav-cursor");
  const countEl = statusBar.querySelector(".vim-nav-count");
  const confirmEl = statusBar.querySelector(".vim-nav-confirm") as HTMLElement | null;
  const hintEl = statusBar.querySelector(".vim-nav-hint") as HTMLElement | null;

  if (modeEl) modeEl.textContent = navModeType === "edit" ? "Edit" : "Focus";
  if (textEl) textEl.textContent = keyBuffer;
  if (cursorEl) (cursorEl as HTMLElement).style.display = "";
  if (countEl) countEl.textContent = `(${hintMap.size} hints)`;

  if (keyBuffer.length === 0) {
    if (confirmEl) confirmEl.textContent = "";
    if (hintEl) hintEl.textContent = "";
    return;
  }

  const matching = getMatchingHints();
  const exactMatch = hintMap.has(keyBuffer) ? hintMap.get(keyBuffer)! : null;
  const needsEnter = exactMatch && hasLongerHintsFor(keyBuffer);

  if (needsEnter && confirmEl) {
    const typeLabel = exactMatch.type === "crumb" ? "breadcrumb" : exactMatch.type === "panel" ? "ancestor" : "node";
    confirmEl.textContent = `[Enter to jump to ${typeLabel}]`;
  } else if (confirmEl) {
    confirmEl.textContent = "";
  }

  if (hintEl) {
    hintEl.textContent = `${matching.length} matching`;
    hintEl.classList.remove("vim-nav-error");
  }
}

function hideStatusBar(): void {
  if (statusBar) {
    statusBar.style.display = "none";
  }
}

function removeStatusBar(): void {
  if (statusBar) {
    statusBar.remove();
    statusBar = null;
  }
}

function showError(msg: string): void {
  if (!statusBar) return;
  const hintEl = statusBar.querySelector(".vim-nav-hint") as HTMLElement | null;
  if (hintEl) {
    hintEl.textContent = msg;
    hintEl.classList.add("vim-nav-error");
    setTimeout(() => {
      if (hintEl) hintEl.classList.remove("vim-nav-error");
    }, 800);
  }
}

function jumpTo(entry: HintEntry): void {
  logDebug(`JUMP start type=${entry.type} nodeId=${entry.nodeId} mode=${navModeType}`);
  entry.el.scrollIntoView({ block: "center", behavior: "smooth" });

  if (entry.type === "crumb" || entry.type === "panel") {
    if (entry.nodeId === "__home__" || entry.nodeId === "__zoom_root__") {
      store.zoomToRoot();
    } else {
      store.zoomIn(entry.nodeId);
    }
    return;
  }

  const nodeId = entry.nodeId;

  if (navModeType === "edit") {
    store.setFocusedNode(nodeId);
    logDebug(`JUMP edit-mode: setFocusedNode(${nodeId}) → editor opens`);
  } else {
    store.zoomIn(nodeId);
    logDebug(`JUMP focus-mode: zoomIn(${nodeId}) → view zooms to children`);
  }
}

function handleHintKey(e: KeyboardEvent): void {
  const key = e.key;
  logDebug(`KEY  key=${key} buffer_before="${keyBuffer}"`);

  if (key === "Escape") {
    logDebug("KEY  Escape → exitNavMode");
    e.preventDefault();
    e.stopImmediatePropagation();
    exitNavMode();
    return;
  }

  if (key === "Backspace") {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (keyBuffer.length > 0) {
      keyBuffer = keyBuffer.slice(0, -1);
      logDebug(`KEY  Backspace → buffer="${keyBuffer}"`);
      updateStatusBar();
      updateHintDimming();
    }
    return;
  }

  if (key === "Enter") {
    e.preventDefault();
    e.stopImmediatePropagation();
    logDebug(`KEY  Enter → buffer="${keyBuffer}"`);
    if (hintMap.has(keyBuffer)) {
      const entry = hintMap.get(keyBuffer)!;
      logDebug(`JUMP Enter-confirm type=${entry.type} nodeId=${entry.nodeId} mode=${navModeType}`);
      jumpTo(entry);
      exitNavMode();
    }
    return;
  }

  if (key.length === 1 && HINT_KEYS.includes(key as (typeof HINT_KEYS)[number])) {
    e.preventDefault();
    e.stopImmediatePropagation();

    keyBuffer += key;
    logDebug(`KEY  hint key="${key}" → buffer="${keyBuffer}"`);
    updateStatusBar();

    // Exact match — but only jump if no longer hints share this prefix
    if (hintMap.has(keyBuffer) && !hasLongerHintsFor(keyBuffer)) {
      const entry = hintMap.get(keyBuffer)!;
      logDebug(`JUMP exact-match type=${entry.type} nodeId=${entry.nodeId} mode=${navModeType} label="${keyBuffer}"`);
      jumpTo(entry);
      exitNavMode();
      return;
    }

    const matching = getMatchingHints();
    if (matching.length === 0) {
      logDebug(`KEY  no match → pop key`);
      showError("No match");
      keyBuffer = keyBuffer.slice(0, -1);
      updateStatusBar();
    } else {
      updateHintDimming();
    }
    return;
  }
}

function enterNavMode(mode: "edit" | "focus"): void {
  if (navMode) return;
  navMode = true;
  navModeType = mode;

  const crumbs = getCrumbElements();
  const panels = getPanelElements();
  const nodes = getNodeElements();

  logDebug(`ENTER navMode: type=${mode} crumbs=${crumbs.length} panels=${panels.length} nodes=${nodes.length}`);

  if (crumbs.length === 0 && panels.length === 0 && nodes.length === 0) {
    logDebug("ENTER abort: no targets found");
    navMode = false;
    return;
  }

  hintMap = assignHints(crumbs, panels, nodes);
  logDebug(`ENTER hints assigned: ${hintMap.size} total`);
  showStatusBar();
  updateStatusBar();

  keyBuffer = "";

  const activeEl = document.activeElement as HTMLElement | null;
  if (activeEl && activeEl.classList.contains("node-editor")) {
    activeEl.blur();
  }

  keydownHandler = (e: KeyboardEvent) => {
    if (!navMode) {
      removeKeydownHandler();
      return;
    }

    if (e.altKey || e.ctrlKey || e.metaKey) {
      if (e.altKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        exitNavMode();
      }
      return;
    }

    handleHintKey(e);
  };

  document.addEventListener("keydown", keydownHandler, true);
}

function removeKeydownHandler(): void {
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler, true);
    keydownHandler = null;
  }
}

function exitNavMode(): void {
  logDebug("EXIT navMode");
  navMode = false;
  removeKeydownHandler();
  removeAllHints();
  hideStatusBar();
  hintMap.clear();
  keyBuffer = "";
}

function toggleNavMode(mode: "edit" | "focus"): void {
  if (navMode) {
    exitNavMode();
  } else {
    enterNavMode(mode);
  }
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    injectCSS();
    showStatusBar();
    hideStatusBar();

    ctx.registerCommand({
      id: "toggle-vim-nav-edit",
      name: "Vim Nav: Edit Mode",
      shortcut: "Alt+V",
      category: "Navigation",
      keywords: ["vim", "hint", "jump", "navigate", "keyboard", "edit"],
      execute: () => toggleNavMode("edit"),
    });

    ctx.registerCommand({
      id: "toggle-vim-nav-focus",
      name: "Vim Nav: Focus Mode",
      shortcut: "Alt+Shift+V",
      category: "Navigation",
      keywords: ["vim", "hint", "jump", "navigate", "keyboard", "focus"],
      execute: () => toggleNavMode("focus"),
    });

    ctx.registerCommand({
      id: "dump-debug-logs",
      name: "Vim Nav: Dump Debug Logs",
      execute: () => {
        const blob = new Blob([debugLogs.join("\n")], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `vim-nav-debug-${Date.now()}.txt`;
        a.click();
        logDebug("DUMP debug logs downloaded");
      },
    });
  },

  async onUnload() {
    exitNavMode();
    removeStatusBar();

    if (ctxRef) {
      ctxRef.unregisterAllCommands();
      ctxRef = null;
    }

    removeCSS();
  },
};

export default plugin;
