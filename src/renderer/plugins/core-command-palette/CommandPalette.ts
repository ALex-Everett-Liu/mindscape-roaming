import type { Command } from "../../plugin-system/CommandRegistry";
import { setCommandPaletteOpen } from "../../plugin-system/commandPaletteState";

const USAGE_KEY = "mindscape_command_palette_usage";
const RECENT_KEY = "mindscape_command_palette_recent";
const MAX_RECENT = 10;

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function commandMatches(cmd: Command, q: string): boolean {
  if (!q) return true;
  if (cmd.name.toLowerCase().includes(q)) return true;
  if (cmd.id.toLowerCase().includes(q)) return true;
  if (cmd.category?.toLowerCase().includes(q)) return true;
  if (cmd.keywords?.some((k) => k.toLowerCase().includes(q))) return true;
  return false;
}

function rankScore(nameLower: string, q: string): number {
  if (nameLower === q) return 0;
  if (nameLower.startsWith(q)) return 1;
  return 2;
}

function filterAndSort(commands: Command[], q: string): Command[] {
  const nq = normalizeQuery(q);
  if (!nq) return [...commands];
  const filtered = commands.filter((c) => commandMatches(c, nq));
  return filtered.sort((a, b) => {
      const an = a.name.toLowerCase();
      const bn = b.name.toLowerCase();
      const d = rankScore(an, nq) - rankScore(bn, nq);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
}

function injectStyles(): HTMLStyleElement {
  const el = document.createElement("style");
  el.textContent = `
.command-palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: none;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  background: rgba(0, 0, 0, 0.45);
  box-sizing: border-box;
}
.command-palette-overlay.open {
  display: flex;
}
.command-palette {
  width: min(500px, calc(100vw - 32px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #16213e);
  border: 1px solid var(--border, #2a2a4a);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.command-palette-search {
  width: 100%;
  padding: 12px 14px;
  font: inherit;
  color: var(--text, #e0e0e0);
  background: var(--bg, #1a1a2e);
  border: none;
  border-bottom: 1px solid var(--border, #2a2a4a);
  outline: none;
}
.command-palette-search::placeholder {
  color: var(--text-muted, #888);
}
.command-palette-list {
  flex: 1;
  overflow-y: auto;
  min-height: 120px;
  max-height: calc(70vh - 120px);
}
.command-palette-section-header {
  padding: 8px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #888);
}
.command-palette-separator {
  height: 1px;
  margin: 6px 12px;
  background: var(--border, #2a2a4a);
}
.command-palette-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  cursor: pointer;
  border-left: 3px solid transparent;
}
.command-palette-item:hover,
.command-palette-item.selected {
  background: var(--focus-bg, rgba(79, 195, 247, 0.12));
}
.command-palette-item.selected {
  border-left-color: var(--accent, #4fc3f7);
}
.command-palette-item-left {
  flex: 1;
  min-width: 0;
}
.command-palette-item-name {
  font-weight: 500;
  color: var(--text, #e0e0e0);
}
.command-palette-item-category {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin-top: 2px;
}
.command-palette-item-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.command-palette-usage {
  font-size: 11px;
  color: var(--text-muted, #888);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 4px;
}
.command-palette-shortcut {
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #888);
}
.command-palette-info {
  padding: 8px 14px 10px;
  font-size: 12px;
  color: var(--text-muted, #888);
  border-top: 1px solid var(--border, #2a2a4a);
}
`;
  document.head.appendChild(el);
  return el;
}

export interface CommandPaletteApi {
  toggle: () => void;
  open: () => void;
  close: () => void;
  destroy: () => void;
}

export function createCommandPalette(getCommands: () => Command[]): CommandPaletteApi {
  let usageCounts = loadJson<Record<string, number>>(USAGE_KEY, {});
  let recentIds = loadJson<string[]>(RECENT_KEY, []);

  let overlay: HTMLDivElement | null = null;
  let searchInput: HTMLInputElement | null = null;
  let listEl: HTMLDivElement | null = null;
  let styleEl: HTMLStyleElement | null = null;

  let filtered: Command[] = [];
  let selectedIndex = -1;
  let keyNavHandler: ((e: KeyboardEvent) => void) | null = null;

  function persistUsage(): void {
    saveJson(USAGE_KEY, usageCounts);
    saveJson(RECENT_KEY, recentIds);
  }

  function trackCommandUsage(cmd: Command): void {
    usageCounts[cmd.id] = (usageCounts[cmd.id] ?? 0) + 1;
    recentIds = [cmd.id, ...recentIds.filter((id) => id !== cmd.id)].slice(0, MAX_RECENT);
    persistUsage();
  }

  function getValidRecent(commands: Command[]): Command[] {
    const byId = new Map(commands.map((c) => [c.id, c]));
    const out: Command[] = [];
    for (const id of recentIds) {
      const c = byId.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  function buildDom(): void {
    styleEl = injectStyles();

    overlay = document.createElement("div");
    overlay.className = "command-palette-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const panel = document.createElement("div");
    panel.className = "command-palette";
    panel.addEventListener("click", (e) => e.stopPropagation());

    searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "command-palette-search";
    searchInput.placeholder = "Search commands…";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;

    listEl = document.createElement("div");
    listEl.className = "command-palette-list";

    const info = document.createElement("div");
    info.className = "command-palette-info";
    info.textContent = "↑↓ navigate · Enter run · Esc close · Ctrl+P toggle";

    listEl.appendChild(info);
    panel.appendChild(searchInput);
    panel.appendChild(listEl);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    searchInput.addEventListener("input", () => render());
  }

  function render(): void {
    if (!listEl || !searchInput) return;

    const all = getCommands();
    const q = searchInput.value;
    const nq = normalizeQuery(q);
    listEl.innerHTML = "";

    if (!nq) {
      const recent = getValidRecent(all);
      const recentSet = new Set(recent.map((c) => c.id));
      const rest = all.filter((c) => !recentSet.has(c.id));

      if (recent.length > 0) {
        const h = document.createElement("div");
        h.className = "command-palette-section-header";
        h.textContent = "Recently used";
        listEl.appendChild(h);
        recent.forEach((cmd, i) => listEl!.appendChild(createRow(cmd, i)));
        const sep = document.createElement("div");
        sep.className = "command-palette-separator";
        listEl.appendChild(sep);
        const h2 = document.createElement("div");
        h2.className = "command-palette-section-header";
        h2.textContent = "All commands";
        listEl.appendChild(h2);
        rest.forEach((cmd, i) =>
          listEl!.appendChild(createRow(cmd, recent.length + i))
        );
        filtered = [...recent, ...rest];
      } else {
        all.forEach((cmd, i) => listEl!.appendChild(createRow(cmd, i)));
        filtered = [...all];
      }
    } else {
      filtered = filterAndSort(all, q);
      filtered.forEach((cmd, i) => listEl!.appendChild(createRow(cmd, i)));
    }

    const info = document.createElement("div");
    info.className = "command-palette-info";
    info.textContent =
      "↑↓ navigate · Enter run · Esc close · Ctrl+P toggle";
    listEl.appendChild(info);

    selectedIndex = filtered.length > 0 ? 0 : -1;
    updateSelection();
  }

  function createRow(cmd: Command, index: number): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "command-palette-item";
    row.dataset.index = String(index);
    row.addEventListener("mouseenter", () => {
      selectedIndex = index;
      updateSelection();
    });
    row.addEventListener("click", () => {
      selectedIndex = index;
      executeSelected();
    });

    const left = document.createElement("div");
    left.className = "command-palette-item-left";
    const name = document.createElement("div");
    name.className = "command-palette-item-name";
    name.textContent = cmd.name;
    left.appendChild(name);
    if (cmd.category) {
      const cat = document.createElement("div");
      cat.className = "command-palette-item-category";
      cat.textContent = cmd.category;
      left.appendChild(cat);
    }

    const right = document.createElement("div");
    right.className = "command-palette-item-right";
    const count = usageCounts[cmd.id] ?? 0;
    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "command-palette-usage";
      badge.textContent = String(count);
      right.appendChild(badge);
    }
    if (cmd.shortcut) {
      const sc = document.createElement("span");
      sc.className = "command-palette-shortcut";
      sc.textContent = cmd.shortcut;
      right.appendChild(sc);
    }

    row.appendChild(left);
    if (right.childElementCount > 0) row.appendChild(right);
    return row;
  }

  function updateSelection(): void {
    if (!listEl) return;
    const items = listEl.querySelectorAll(".command-palette-item");
    items.forEach((el, i) => {
      el.classList.toggle("selected", i === selectedIndex);
    });
    const sel = items[selectedIndex] as HTMLElement | undefined;
    sel?.scrollIntoView({ block: "nearest" });
  }

  function executeSelected(): void {
    if (selectedIndex < 0 || selectedIndex >= filtered.length) return;
    const cmd = filtered[selectedIndex];
    close();
    trackCommandUsage(cmd);
    try {
      void cmd.execute();
    } catch (err) {
      console.error("Command palette action failed:", err);
    }
  }

  function handleKeyNav(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      if (filtered.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = (selectedIndex + 1) % filtered.length;
      updateSelection();
      return;
    }
    if (e.key === "ArrowUp") {
      if (filtered.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
      updateSelection();
      return;
    }
    if (e.key === "Enter") {
      if (filtered.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      executeSelected();
    }
  }

  function attachKeyNav(): void {
    if (keyNavHandler) return;
    keyNavHandler = handleKeyNav;
    document.addEventListener("keydown", keyNavHandler, true);
  }

  function detachKeyNav(): void {
    if (keyNavHandler) {
      document.removeEventListener("keydown", keyNavHandler, true);
      keyNavHandler = null;
    }
  }

  function open(): void {
    if (!overlay) buildDom();
    if (!overlay || !searchInput) return;

    const input = searchInput;
    input.value = "";
    render();

    overlay.classList.add("open");
    setCommandPaletteOpen(true);
    attachKeyNav();
    setTimeout(() => input.focus(), 0);
  }

  function close(): void {
    if (overlay) overlay.classList.remove("open");
    setCommandPaletteOpen(false);
    detachKeyNav();
  }

  function toggle(): void {
    if (overlay?.classList.contains("open")) close();
    else open();
  }

  function destroy(): void {
    close();
    if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    searchInput = null;
    listEl = null;
    if (styleEl?.parentNode) styleEl.parentNode.removeChild(styleEl);
    styleEl = null;
  }

  return { toggle, open, close, destroy };
}
