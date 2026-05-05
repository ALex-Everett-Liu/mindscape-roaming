import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";

const HINT_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"] as const;

interface HintEntry {
  el: HTMLElement;
  label: string;
  nodeId: string;
}

let ctxRef: RendererPluginContext | null = null;
let styleEl: HTMLStyleElement | null = null;
let navMode = false;
let hintMap = new Map<string, HintEntry>();
let keyBuffer = "";
let statusBar: HTMLElement | null = null;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let hintElements: HTMLElement[] = [];

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

function getVisibleNodeElements(): HTMLElement[] {
  const all = document.querySelectorAll<HTMLElement>(".outline-node[data-node-id]");
  const results: HTMLElement[] = [];
  for (const el of all) {
    const nodeId = el.dataset.nodeId;
    if (nodeId) results.push(el);
  }
  return results;
}

function assignHints(nodes: HTMLElement[]): Map<string, HintEntry> {
  const labels = generateHintLabels(nodes.length);
  const map = new Map<string, HintEntry>();

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const label = labels[i];
    const nodeId = el.dataset.nodeId!;

    map.set(label, { el, label, nodeId });

    const hintEl = document.createElement("span");
    hintEl.className = "vim-hint";
    hintEl.textContent = label;
    hintEl.dataset.vimHint = label;

    const row = el.querySelector<HTMLElement>(":scope > .node-row");
    if (row) {
      row.insertBefore(hintEl, row.firstChild);
    }
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
    <span>Vim Nav</span>
    <span class="vim-nav-buffer"><span class="vim-nav-text"></span><span class="vim-nav-cursor"></span></span>
    <span class="vim-nav-count"></span>
    <span class="vim-nav-hint"></span>
  `;
  statusBar.style.display = "none";
  document.body.appendChild(statusBar);
}

function updateStatusBar(): void {
  if (!statusBar) return;
  statusBar.style.display = "";

  const textEl = statusBar.querySelector(".vim-nav-text");
  const cursorEl = statusBar.querySelector(".vim-nav-cursor");
  const countEl = statusBar.querySelector(".vim-nav-count");
  const hintEl = statusBar.querySelector(".vim-nav-hint") as HTMLElement | null;

  if (textEl) textEl.textContent = keyBuffer;
  if (cursorEl) (cursorEl as HTMLElement).style.display = "";
  if (countEl) countEl.textContent = `(${hintMap.size} hints)`;

  if (hintEl) {
    if (keyBuffer.length === 0) {
      hintEl.textContent = "";
    } else {
      const matching = getMatchingHints();
      hintEl.textContent = `${matching.length} matching`;
    }
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

function updateHintDimming(): void {
  if (!keyBuffer) {
    for (const [, entry] of hintMap) {
      const hintEl = findHintElement(entry.el, entry.label);
      if (hintEl) hintEl.classList.remove("dim");
    }
    return;
  }

  const matching = new Set(getMatchingHints().map((h) => h.label));
  for (const [label, entry] of hintMap) {
    const hintEl = findHintElement(entry.el, entry.label);
    if (hintEl) {
      hintEl.classList.toggle("dim", !matching.has(label));
    }
  }
}

function findHintElement(nodeEl: HTMLElement, label: string): HTMLElement | null {
  return nodeEl.querySelector<HTMLElement>(`.vim-hint[data-vim-hint="${label}"]`);
}

function jumpTo(entry: HintEntry): void {
  entry.el.scrollIntoView({ block: "center", behavior: "smooth" });

  requestAnimationFrame(() => {
    store.setFocusedNode(entry.nodeId);

    setTimeout(() => {
      const editor = entry.el.querySelector<HTMLElement>(".node-editor");
      if (editor) {
        editor.focus();
      }
    }, 50);
  });
}

function handleHintKey(e: KeyboardEvent): void {
  const key = e.key;

  if (key === "Escape") {
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
      updateStatusBar();
      updateHintDimming();
    }
    return;
  }

  if (key.length === 1 && HINT_KEYS.includes(key as typeof HINT_KEYS[number])) {
    e.preventDefault();
    e.stopImmediatePropagation();

    keyBuffer += key;
    updateStatusBar();

    if (hintMap.has(keyBuffer)) {
      const entry = hintMap.get(keyBuffer)!;
      jumpTo(entry);
      exitNavMode();
      return;
    }

    const matching = getMatchingHints();
    if (matching.length === 0) {
      showError("No match");
      keyBuffer = keyBuffer.slice(0, -1);
      updateStatusBar();
    } else {
      updateHintDimming();
    }
    return;
  }
}

function enterNavMode(): void {
  if (navMode) return;
  navMode = true;

  const nodes = getVisibleNodeElements();
  if (nodes.length === 0) {
    navMode = false;
    return;
  }

  hintMap = assignHints(nodes);
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
      if (e.altKey && e.key === "v") {
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
  navMode = false;
  removeKeydownHandler();
  removeAllHints();
  hideStatusBar();
  hintMap.clear();
  keyBuffer = "";
}

function toggleNavMode(): void {
  if (navMode) {
    exitNavMode();
  } else {
    enterNavMode();
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
      id: "toggle-vim-nav",
      name: "Toggle Vim Navigation",
      shortcut: "Alt+V",
      category: "Navigation",
      keywords: ["vim", "hint", "jump", "navigate", "keyboard"],
      execute: toggleNavMode,
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
