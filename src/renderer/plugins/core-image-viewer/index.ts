import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

const IMAGE_REGEX = /!\[.*?\]\(\s*([^\s=)]+)(?:\s*=\s*(\d+)(?:\s*x\s*(\d+))?)?\s*\)/g;

interface ImageMatch {
  fullMatch: string;
  path: string;
  width?: number;
  height?: number;
  index: number;
  length: number;
}

let styleEl: HTMLStyleElement | null = null;
let ctxRef: RendererPluginContext | null = null;
const imageCache = new Map<string, string>();
let fullscreenOverlay: HTMLElement | null = null;
let fullscreenImg: HTMLImageElement | null = null;
let currentZoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panLastX = 0;
let panLastY = 0;
let observer: MutationObserver | null = null;

// ─── CSS ────────────────────────────────────────────

const CSS = `
.image-wrapper {
  position: relative;
  display: inline-block;
  vertical-align: top;
  margin: 4px 0;
  max-width: 100%;
}
.image-wrapper img {
  display: block;
  max-width: 100%;
  border-radius: 4px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.image-wrapper img:hover {
  box-shadow: 0 0 0 2px var(--accent, #4fc3f7);
}
.image-resize-handle {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 10px;
  height: 10px;
  background: var(--accent, #4fc3f7);
  cursor: nwse-resize;
  border-radius: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 2;
}
.image-wrapper:hover .image-resize-handle {
  opacity: 0.85;
}
.image-error {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(255, 82, 82, 0.15);
  border: 1px solid rgba(255, 82, 82, 0.4);
  border-radius: 4px;
  color: var(--text, #ccc);
  font-size: 0.85em;
  cursor: default;
}

.image-viewer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}
.image-viewer-overlay.panning {
  cursor: grabbing;
}
.image-viewer-img-wrap {
  position: relative;
  overflow: hidden;
  max-width: 95vw;
  max-height: 95vh;
}
.image-viewer-img-wrap img {
  display: block;
  transition: transform 0.05s linear;
  user-select: none;
  -webkit-user-select: none;
}
.image-viewer-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
  transition: background 0.15s;
}
.image-viewer-close:hover {
  background: rgba(255, 255, 255, 0.25);
}
.image-viewer-zoom-info {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  z-index: 10002;
  pointer-events: none;
  transition: opacity 0.3s;
}
`;

// ─── CSS injection ──────────────────────────────────

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

// ─── Image resolution ───────────────────────────────

async function resolveImage(path: string): Promise<string | null> {
  if (imageCache.has(path)) return imageCache.get(path)!;
  try {
    const res = await api.readImageFile({ path });
    if (res.success && res.data) {
      imageCache.set(path, res.data);
      return res.data;
    }
  } catch {
    // fall through
  }
  imageCache.set(path, "");
  return null;
}

// ─── Parse image syntax ─────────────────────────────

function parseImageSyntax(text: string): ImageMatch[] {
  const matches: ImageMatch[] = [];
  let m: RegExpExecArray | null;
  IMAGE_REGEX.lastIndex = 0;
  while ((m = IMAGE_REGEX.exec(text)) !== null) {
    matches.push({
      fullMatch: m[0],
      path: m[1],
      width: m[2] ? parseInt(m[2], 10) : undefined,
      height: m[3] ? parseInt(m[3], 10) : undefined,
      index: m.index,
      length: m[0].length,
    });
  }
  IMAGE_REGEX.lastIndex = 0;
  return matches;
}

// ─── Build image syntax ─────────────────────────────

function buildImageSyntax(path: string, width?: number, height?: number): string {
  if (width !== undefined && height !== undefined) {
    return `![](${path} =${width}x${height})`;
  }
  if (width !== undefined) {
    return `![](${path} =${width})`;
  }
  return `![](${path})`;
}

// ─── Fullscreen viewer ──────────────────────────────

function openFullscreen(src: string): void {
  closeFullscreen();

  fullscreenOverlay = document.createElement("div");
  fullscreenOverlay.className = "image-viewer-overlay";

  const wrap = document.createElement("div");
  wrap.className = "image-viewer-img-wrap";

  fullscreenImg = document.createElement("img");
  fullscreenImg.src = src;
  fullscreenImg.draggable = false;

  wrap.appendChild(fullscreenImg);
  fullscreenOverlay.appendChild(wrap);

  const closeBtn = document.createElement("button");
  closeBtn.className = "image-viewer-close";
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "Close (Esc)";
  closeBtn.addEventListener("click", closeFullscreen);
  fullscreenOverlay.appendChild(closeBtn);

  const zoomInfo = document.createElement("div");
  zoomInfo.className = "image-viewer-zoom-info";
  zoomInfo.textContent = "100%";
  fullscreenOverlay.appendChild(zoomInfo);

  currentZoom = 1;
  panX = 0;
  panY = 0;

  fullscreenImg.addEventListener("load", () => {
    updateFullscreenZoomInfo();
  });

  fullscreenImg.addEventListener("wheel", handleFullscreenWheel, { passive: false });
  fullscreenImg.addEventListener("mousedown", handleFullscreenMouseDown);
  document.addEventListener("mousemove", handleFullscreenMouseMove);
  document.addEventListener("mouseup", handleFullscreenMouseUp);
  document.addEventListener("keydown", handleFullscreenKey);
  fullscreenOverlay.addEventListener("click", (e) => {
    if (e.target === fullscreenOverlay) closeFullscreen();
  });
  fullscreenOverlay.addEventListener("dblclick", (e) => {
    if (e.target === fullscreenOverlay) closeFullscreen();
  });

  document.body.appendChild(fullscreenOverlay);
  updateFullscreenTransform();
}

function closeFullscreen(): void {
  if (fullscreenOverlay) {
    document.removeEventListener("mousemove", handleFullscreenMouseMove);
    document.removeEventListener("mouseup", handleFullscreenMouseUp);
    document.removeEventListener("keydown", handleFullscreenKey);
    fullscreenOverlay.remove();
    fullscreenOverlay = null;
    fullscreenImg = null;
    isPanning = false;
  }
}

function updateFullscreenTransform(): void {
  if (!fullscreenImg) return;
  fullscreenImg.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
  updateFullscreenZoomInfo();
}

let zoomInfoTimeout: ReturnType<typeof setTimeout> | null = null;

function updateFullscreenZoomInfo(): void {
  if (!fullscreenOverlay) return;
  const info = fullscreenOverlay.querySelector(".image-viewer-zoom-info") as HTMLElement | null;
  if (!info) return;
  info.textContent = `${Math.round(currentZoom * 100)}%`;
  info.style.opacity = "1";
  if (zoomInfoTimeout) clearTimeout(zoomInfoTimeout);
  zoomInfoTimeout = setTimeout(() => {
    if (info) info.style.opacity = "0";
  }, 1500);
}

function handleFullscreenWheel(e: WheelEvent): void {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(10, Math.max(0.1, currentZoom * delta));

  if (!fullscreenImg || !fullscreenOverlay) {
    currentZoom = newZoom;
    return;
  }

  const rect = fullscreenImg.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const viewCenterX = fullscreenOverlay.clientWidth / 2;
  const viewCenterY = fullscreenOverlay.clientHeight / 2;

  panX = viewCenterX - (viewCenterX - panX) * (newZoom / currentZoom);
  panY = viewCenterY - (viewCenterY - panY) * (newZoom / currentZoom);

  currentZoom = newZoom;
  updateFullscreenTransform();
}

function handleFullscreenMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panLastX = panX;
  panLastY = panY;
  if (fullscreenOverlay) fullscreenOverlay.classList.add("panning");
  e.preventDefault();
}

function handleFullscreenMouseMove(e: MouseEvent): void {
  if (!isPanning) return;
  panX = panLastX + (e.clientX - panStartX);
  panY = panLastY + (e.clientY - panStartY);
  updateFullscreenTransform();
}

function handleFullscreenMouseUp(_e: MouseEvent): void {
  if (isPanning) {
    isPanning = false;
    if (fullscreenOverlay) fullscreenOverlay.classList.remove("panning");
  }
}

function handleFullscreenKey(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    closeFullscreen();
  }
}

// ─── Text node wrapping ─────────────────────────────

function wrapTextNode(
  node: Text,
  editor: HTMLElement,
  onMatch: (match: ImageMatch) => HTMLElement
): void {
  const text = node.textContent || "";
  const parent = node.parentNode;
  if (!parent) return;

  const matches = parseImageSyntax(text);
  if (matches.length === 0) return;

  const fragments: Node[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.index > lastIndex) {
      fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    fragments.push(onMatch(match));
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

// ─── Resize handle ──────────────────────────────────

interface ResizeState {
  wrapper: HTMLElement;
  img: HTMLImageElement;
  editor: HTMLElement;
  path: string;
  fullMatch: string;
  startWidth: number;
  startHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  startX: number;
  startY: number;
}

let resizeState: ResizeState | null = null;

function addResizeHandle(
  wrapper: HTMLElement,
  img: HTMLImageElement,
  editor: HTMLElement,
  path: string,
  match: ImageMatch
): void {
  const handle = document.createElement("div");
  handle.className = "image-resize-handle";

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = img.getBoundingClientRect();
    const naturalW = img.naturalWidth || rect.width;
    const naturalH = img.naturalHeight || rect.height;

    resizeState = {
      wrapper,
      img,
      editor,
      path,
      fullMatch: match.fullMatch,
      startWidth: rect.width,
      startHeight: rect.height,
      naturalWidth: naturalW,
      naturalHeight: naturalH,
      startX: e.clientX,
      startY: e.clientY,
    };
  });

  wrapper.appendChild(handle);
}

function handleResizeMouseMove(e: MouseEvent): void {
  if (!resizeState) return;

  const dx = e.clientX - resizeState.startX;
  const dy = e.clientY - resizeState.startY;
  const aspect = resizeState.naturalWidth / resizeState.naturalHeight;

  let newWidth: number;
  let newHeight: number;

  if (e.shiftKey) {
    newWidth = Math.max(20, resizeState.startWidth + dx);
    newHeight = newWidth / aspect;
  } else {
    newWidth = Math.max(20, resizeState.startWidth + dx);
    newHeight = Math.max(20, resizeState.startHeight + dy);
  }

  newWidth = Math.round(newWidth);
  newHeight = Math.round(newHeight);

  resizeState.img.style.width = `${newWidth}px`;
  resizeState.img.style.height = `${newHeight}px`;
}

async function handleResizeMouseUp(_e: MouseEvent): Promise<void> {
  if (!resizeState) return;

  const { editor, path, fullMatch, img } = resizeState;
  const newWidth = parseInt(img.style.width, 10) || resizeState.startWidth;
  const newHeight = parseInt(img.style.height, 10) || resizeState.startHeight;

  resizeState = null;

  const nodeId = (editor as HTMLElement).dataset.nodeId;
  if (!nodeId) return;

  const res = await api.getNode(nodeId);
  if (!res.success || !res.data) return;

  const newSyntax = buildImageSyntax(path, newWidth, newHeight);
  const newContent = res.data.content.replace(fullMatch, newSyntax);

  img.style.width = `${newWidth}px`;
  img.style.height = `${newHeight}px`;

  store.updateContent(nodeId, newContent);
}

// ─── Transform / Unwrap ─────────────────────────────

async function transformEditor(editor: HTMLElement): Promise<void> {
  if (editor.contains(document.activeElement)) return;
  if (editor.querySelector(".image-wrapper")) return;

  const raw = editor.textContent || "";
  if (!IMAGE_REGEX.test(raw)) return;
  IMAGE_REGEX.lastIndex = 0;

  const matches = parseImageSyntax(raw);
  if (matches.length === 0) return;

  const uniquePaths = new Set(matches.map((m) => m.path));
  await Promise.all([...uniquePaths].map((p) => resolveImage(p)));

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode()) !== null) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    if (!textNode.parentNode) continue;
    const txt = textNode.textContent || "";
    if (!IMAGE_REGEX.test(txt)) continue;
    IMAGE_REGEX.lastIndex = 0;

    wrapTextNode(textNode, editor, (match) => {
      const wrapper = document.createElement("span");
      wrapper.className = "image-wrapper";
      wrapper.setAttribute("contenteditable", "false");
      wrapper.dataset.imagePath = match.path;
      wrapper.dataset.matchStart = String(match.index);
      wrapper.dataset.matchLength = String(match.length);

      const dataUrl = imageCache.get(match.path);

      if (!dataUrl) {
        const error = document.createElement("span");
        error.className = "image-error";
        error.textContent = `[Image not found: ${match.path}]`;
        wrapper.appendChild(error);
        return wrapper;
      }

      const img = document.createElement("img");
      img.src = dataUrl;
      img.draggable = false;
      if (match.width) img.style.width = `${match.width}px`;
      if (match.height) img.style.height = `${match.height}px`;

      img.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFullscreen(dataUrl);
      });

      wrapper.appendChild(img);
      addResizeHandle(wrapper, img, editor, match.path, match);

      return wrapper;
    });
  }
}

function unwrapImages(editor: HTMLElement): void {
  if (editor.querySelector(".image-wrapper")) {
    editor.textContent = editor.textContent;
  }
}

// ─── Event handlers ─────────────────────────────────

function handleFocusIn(e: FocusEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;
  unwrapImages(target);
}

async function handleFocusOut(e: FocusEvent): Promise<void> {
  const target = e.target as HTMLElement | null;
  if (!target?.classList.contains("node-editor")) return;
  await transformEditor(target);
}

function getEditors(): NodeListOf<HTMLElement> {
  return document.querySelectorAll(".node-editor");
}

async function scanAndTransform(): Promise<void> {
  const editors = getEditors();
  await Promise.all(
    Array.from(editors).map((ed) =>
      !ed.contains(document.activeElement) ? transformEditor(ed) : Promise.resolve()
    )
  );
}

// ─── Plugin ─────────────────────────────────────────

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    injectCSS();
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("mousemove", handleResizeMouseMove);
    document.addEventListener("mouseup", handleResizeMouseUp);

    observer = new MutationObserver((mutations) => {
      const shouldScan = mutations.some(
        (m) => m.type === "childList" && m.addedNodes.length > 0
      );
      if (shouldScan) {
        void scanAndTransform();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    ctx.registerCommand({
      id: "insert-image",
      name: "Insert Image",
      category: "Insert",
      keywords: ["image", "picture", "img", "photo"],
      execute: () => {
        const nodeId = store.getState().focusedNodeId;
        if (!nodeId) return;
        void (async () => {
          const res = await api.getNode(nodeId);
          if (res.success && res.data) {
            const newContent = res.data.content.trimEnd() + "\n![](assets/image.png)";
            store.updateContent(nodeId, newContent);
          }
        })();
      },
    });

    void ctx.emit("context-menu:register", {
      id: "image-insert",
      pluginId: "core-image-viewer",
      label: "Insert Image",
      dividerBefore: true,
      execute: async (_nodeId: string) => {
        const res = await api.getNode(_nodeId);
        if (res.success && res.data) {
          const newContent = res.data.content.trimEnd() + "\n![](assets/image.png)";
          store.updateContent(_nodeId, newContent);
        }
      },
    });

    await scanAndTransform();
  },

  async onUnload() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    document.removeEventListener("mousemove", handleResizeMouseMove);
    document.removeEventListener("mouseup", handleResizeMouseUp);

    closeFullscreen();

    if (ctxRef) {
      ctxRef.unregisterAllCommands();
      void ctxRef.emit("context-menu:unregister", {
        pluginId: "core-image-viewer",
        id: "image-insert",
      });
      ctxRef = null;
    }

    getEditors().forEach(unwrapImages);
    removeCSS();
    imageCache.clear();
  },
};

export default plugin;
