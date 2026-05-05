import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { store } from "../../state/store";
import { api } from "../../rpc/api";

const IMAGE_REGEX = /!\[.*?\]\(\s*([^\s=)]+)(?:\s*=\s*(\d+)?\s*(?:x\s*(\d+))?)?\s*\)/g;

interface GalleryImage {
  path: string;
  nodeId: string;
}

let styleEl: HTMLStyleElement | null = null;
let ctxRef: RendererPluginContext | null = null;
const imageCache = new Map<string, string>();

let galleryOverlay: HTMLElement | null = null;
let galleryImages: GalleryImage[] = [];
let currentIndex = 0;
let currentZoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panLastX = 0;
let panLastY = 0;
let zoomInfoTimeout: ReturnType<typeof setTimeout> | null = null;

const CSS = `
.image-gallery-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.94);
  z-index: 10002;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}
.image-gallery-overlay.panning {
  cursor: grabbing;
}
.image-gallery-img-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 60px 70px;
  box-sizing: border-box;
}
.image-gallery-img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: opacity 0.2s ease, transform 0.05s linear;
  user-select: none;
  -webkit-user-select: none;
}
.image-gallery-img.loading {
  opacity: 0.3;
}
.image-gallery-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 50px;
  height: 50px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 50%;
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10003;
  transition: background 0.15s, opacity 0.15s;
  opacity: 0.5;
}
.image-gallery-nav:hover {
  background: rgba(255, 255, 255, 0.22);
  opacity: 1;
}
.image-gallery-nav:active {
  background: rgba(255, 255, 255, 0.35);
}
.image-gallery-nav-left {
  left: 12px;
}
.image-gallery-nav-right {
  right: 12px;
}
.image-gallery-nav-hidden {
  opacity: 0;
  pointer-events: none;
}
.image-gallery-close {
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
  z-index: 10003;
  transition: background 0.15s;
}
.image-gallery-close:hover {
  background: rgba(255, 255, 255, 0.25);
}
.image-gallery-info {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 16px;
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 6px 16px;
  border-radius: 12px;
  font-size: 13px;
  z-index: 10003;
  pointer-events: none;
}
.image-gallery-counter {
  font-weight: 600;
  white-space: nowrap;
}
.image-gallery-path {
  color: rgba(255, 255, 255, 0.6);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.image-gallery-zoom-info {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  z-index: 10003;
  pointer-events: none;
  transition: opacity 0.3s;
}
.image-gallery-empty {
  color: rgba(255, 255, 255, 0.5);
  font-size: 16px;
  text-align: center;
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
    // core-image-viewer not loaded
  }
  imageCache.set(path, "");
  return null;
}

// ─── Gather images ──────────────────────────────────

function parseImagePaths(content: string): string[] {
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  IMAGE_REGEX.lastIndex = 0;
  while ((m = IMAGE_REGEX.exec(content)) !== null) {
    paths.push(m[1]);
  }
  IMAGE_REGEX.lastIndex = 0;
  return paths;
}

async function gatherImages(nodeId: string): Promise<GalleryImage[]> {
  const seen = new Set<string>();
  const images: GalleryImage[] = [];

  function addFromContent(content: string, nid: string): void {
    const paths = parseImagePaths(content);
    for (const p of paths) {
      if (!seen.has(p)) {
        seen.add(p);
        images.push({ path: p, nodeId: nid });
      }
    }
  }

  const ancRes = await api.getAncestors(nodeId);
  if (ancRes.success && ancRes.data) {
    for (const anc of ancRes.data) {
      addFromContent(anc.content, anc.id);
    }
  }

  const nodeRes = await api.getNode(nodeId);
  if (nodeRes.success && nodeRes.data) {
    addFromContent(nodeRes.data.content, nodeId);
  }

  return images;
}

// ─── Gallery UI ─────────────────────────────────────

function closeGallery(): void {
  if (galleryOverlay) {
    document.removeEventListener("mousemove", handleGalleryMouseMove);
    document.removeEventListener("mouseup", handleGalleryMouseUp);
    document.removeEventListener("keydown", handleGalleryKey);
    galleryOverlay.remove();
    galleryOverlay = null;
    isPanning = false;
  }
}

function updateGalleryTransform(): void {
  const img = galleryOverlay?.querySelector(".image-gallery-img") as HTMLImageElement | null;
  if (!img) return;
  img.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

function showZoomInfo(): void {
  if (!galleryOverlay) return;
  let info = galleryOverlay.querySelector(".image-gallery-zoom-info") as HTMLElement | null;
  if (!info) {
    info = document.createElement("div");
    info.className = "image-gallery-zoom-info";
    galleryOverlay.appendChild(info);
  }
  info.textContent = `${Math.round(currentZoom * 100)}%`;
  info.style.opacity = "1";
  if (zoomInfoTimeout) clearTimeout(zoomInfoTimeout);
  zoomInfoTimeout = setTimeout(() => {
    if (info) info.style.opacity = "0";
  }, 1500);
}

function updateNavButtons(): void {
  if (!galleryOverlay) return;
  const left = galleryOverlay.querySelector(".image-gallery-nav-left") as HTMLElement | null;
  const right = galleryOverlay.querySelector(".image-gallery-nav-right") as HTMLElement | null;
  if (left) left.classList.toggle("image-gallery-nav-hidden", currentIndex <= 0);
  if (right) right.classList.toggle("image-gallery-nav-hidden", currentIndex >= galleryImages.length - 1);
}

function preloadAdjacent(): void {
  if (currentIndex > 0) {
    resolveImage(galleryImages[currentIndex - 1].path);
  }
  if (currentIndex < galleryImages.length - 1) {
    resolveImage(galleryImages[currentIndex + 1].path);
  }
}

async function showCurrentImage(): Promise<void> {
  if (!galleryOverlay || galleryImages.length === 0) return;

  // Reset zoom/pan
  currentZoom = 1;
  panX = 0;
  panY = 0;

  const img = galleryOverlay.querySelector(".image-gallery-img") as HTMLImageElement | null;
  const counter = galleryOverlay.querySelector(".image-gallery-counter") as HTMLElement | null;
  const pathEl = galleryOverlay.querySelector(".image-gallery-path") as HTMLElement | null;

  if (counter) counter.textContent = `${currentIndex + 1} / ${galleryImages.length}`;

  const image = galleryImages[currentIndex];
  if (pathEl) pathEl.textContent = image.path;

  if (!img) return;

  img.classList.add("loading");
  img.style.transform = "";

  const dataUrl = await resolveImage(image.path);
  img.classList.remove("loading");

  if (dataUrl) {
    img.src = dataUrl;
  } else {
    img.src = "";
  }

  updateGalleryTransform();
  updateNavButtons();
  preloadAdjacent();
}

function navigateGallery(delta: number): void {
  const newIndex = currentIndex + delta;
  if (newIndex < 0 || newIndex >= galleryImages.length) return;
  currentIndex = newIndex;
  showCurrentImage();
}

async function openGallery(images: GalleryImage[], startIndex: number): Promise<void> {
  closeGallery();

  if (images.length === 0) {
    const overlay = document.createElement("div");
    overlay.className = "image-gallery-overlay";

    const msg = document.createElement("div");
    msg.className = "image-gallery-empty";
    msg.textContent = "No images found in this node or its ancestors.";

    const closeBtn = document.createElement("button");
    closeBtn.className = "image-gallery-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.title = "Close (Esc)";
    closeBtn.addEventListener("click", () => overlay.remove());
    overlay.appendChild(closeBtn);

    overlay.appendChild(msg);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") overlay.remove();
    }, { once: true });
    document.body.appendChild(overlay);
    return;
  }

  galleryImages = images;
  currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  currentZoom = 1;
  panX = 0;
  panY = 0;

  galleryOverlay = document.createElement("div");
  galleryOverlay.className = "image-gallery-overlay";

  // Image wrap
  const imgWrap = document.createElement("div");
  imgWrap.className = "image-gallery-img-wrap";

  const img = document.createElement("img");
  img.className = "image-gallery-img loading";
  img.draggable = false;
  imgWrap.appendChild(img);
  galleryOverlay.appendChild(imgWrap);

  // Left arrow
  const leftBtn = document.createElement("button");
  leftBtn.className = "image-gallery-nav image-gallery-nav-left";
  leftBtn.innerHTML = "&#10094;";
  leftBtn.title = "Previous image (←)";
  leftBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateGallery(-1); });
  galleryOverlay.appendChild(leftBtn);

  // Right arrow
  const rightBtn = document.createElement("button");
  rightBtn.className = "image-gallery-nav image-gallery-nav-right";
  rightBtn.innerHTML = "&#10095;";
  rightBtn.title = "Next image (→)";
  rightBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateGallery(1); });
  galleryOverlay.appendChild(rightBtn);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "image-gallery-close";
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "Close (Esc)";
  closeBtn.addEventListener("click", closeGallery);
  galleryOverlay.appendChild(closeBtn);

  // Info bar
  const info = document.createElement("div");
  info.className = "image-gallery-info";
  info.innerHTML = `<span class="image-gallery-counter"></span><span class="image-gallery-path"></span>`;
  galleryOverlay.appendChild(info);

  // Events
  img.addEventListener("wheel", handleGalleryWheel, { passive: false });
  img.addEventListener("mousedown", handleGalleryMouseDown);
  img.addEventListener("dblclick", (e) => { e.stopPropagation(); });
  document.addEventListener("mousemove", handleGalleryMouseMove);
  document.addEventListener("mouseup", handleGalleryMouseUp);
  document.addEventListener("keydown", handleGalleryKey);
  galleryOverlay.addEventListener("click", (e) => {
    if (e.target === galleryOverlay) closeGallery();
  });

  document.body.appendChild(galleryOverlay);

  await showCurrentImage();
}

// ─── Zoom & Pan handlers ────────────────────────────

function handleGalleryWheel(e: WheelEvent): void {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(10, Math.max(0.1, currentZoom * delta));

  const img = galleryOverlay?.querySelector(".image-gallery-img") as HTMLImageElement | null;

  if (!img || !galleryOverlay) {
    currentZoom = newZoom;
    return;
  }

  const rect = img.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const viewCenterX = galleryOverlay.clientWidth / 2;
  const viewCenterY = galleryOverlay.clientHeight / 2;

  panX = viewCenterX - (viewCenterX - panX) * (newZoom / currentZoom);
  panY = viewCenterY - (viewCenterY - panY) * (newZoom / currentZoom);

  currentZoom = newZoom;
  updateGalleryTransform();
  showZoomInfo();
}

function handleGalleryMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return;
  isPanning = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panLastX = panX;
  panLastY = panY;
  if (galleryOverlay) galleryOverlay.classList.add("panning");
  e.preventDefault();
}

function handleGalleryMouseMove(e: MouseEvent): void {
  if (!isPanning) return;
  panX = panLastX + (e.clientX - panStartX);
  panY = panLastY + (e.clientY - panStartY);
  updateGalleryTransform();
}

function handleGalleryMouseUp(_e: MouseEvent): void {
  if (isPanning) {
    isPanning = false;
    if (galleryOverlay) galleryOverlay.classList.remove("panning");
  }
}

function handleGalleryKey(e: KeyboardEvent): void {
  if (!galleryOverlay) return;
  if (e.key === "Escape") {
    closeGallery();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    navigateGallery(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    navigateGallery(1);
  }
}

// ─── Plugin ─────────────────────────────────────────

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    ctxRef = ctx;
    injectCSS();

    ctx.registerCommand({
      id: "open-gallery",
      name: "Open Image Gallery",
      category: "View",
      keywords: ["image", "gallery", "photo", "picture"],
      execute: async () => {
        const nodeId = store.getState().focusedNodeId;
        if (!nodeId) return;
        const images = await gatherImages(nodeId);
        openGallery(images, 0);
      },
    });

    void ctx.emit("context-menu:register", {
      id: "gallery-open",
      pluginId: "third-party-image-gallery",
      label: "Open Image Gallery",
      execute: async (_nodeId: string) => {
        const images = await gatherImages(_nodeId);
        openGallery(images, 0);
      },
    });
  },

  async onUnload() {
    closeGallery();

    if (ctxRef) {
      ctxRef.unregisterAllCommands();
      void ctxRef.emit("context-menu:unregister", {
        pluginId: "third-party-image-gallery",
        id: "gallery-open",
      });
      ctxRef = null;
    }

    removeCSS();
    imageCache.clear();
  },
};

export default plugin;
