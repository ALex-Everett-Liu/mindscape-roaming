import type { RendererPlugin } from "../../../shared/plugin-types";
import type { RendererPluginContext } from "../../plugin-system/RendererPluginContext";
import { manifest } from "./manifest";
import { setDragDropEnabled } from "../../plugin-system/dragDropPluginState";
import { store } from "../../state/store";
import type { OutlineTreeNode } from "../../../shared/types";

const DROP_TARGET_CLASS = "drag-drop-target";

const debugLogs: string[] = [];
function logDebug(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] DND ${msg}`;
  console.log(line);
  debugLogs.push(line);
}

let styleEl: HTMLStyleElement | null = null;
let listenersAttached = false;
let treeContainer: Element | null = null;
let mountTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let draggedNodeId: string | null = null;
let dragoverLoggedThisDrag = false;
let dragHandlers: {
  onDragStart: EventListener;
  onDragOver: EventListener;
  onDragEnd: EventListener;
  onDrop: EventListener;
} | null = null;

function findNode(nodes: OutlineTreeNode[], id: string): OutlineTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** Returns true if nodeId is in ancestorId's subtree. Used to reject moving A onto B when B is under A (cycle). */
function isDescendantOf(
  nodes: OutlineTreeNode[],
  nodeId: string,
  ancestorId: string
): boolean {
  const ancestor = findNode(nodes, ancestorId);
  if (!ancestor || ancestor.children.length === 0) return false;
  const visit = (list: OutlineTreeNode[]): boolean => {
    for (const n of list) {
      if (n.id === nodeId) return true;
      if (visit(n.children)) return true;
    }
    return false;
  };
  return visit(ancestor.children);
}

const plugin: RendererPlugin = {
  manifest,

  async onLoad(ctx: RendererPluginContext) {
    logDebug("onLoad start");
    setDragDropEnabled(true);
    logDebug("dragDropEnabled set to true");

    // Inject drag-drop CSS (reparent-only: single drop target style)
    styleEl = document.createElement("style");
    styleEl.textContent = `
      .outline-node.draggable-node {
        cursor: grab;
      }
      .outline-node.draggable-node:active {
        cursor: grabbing;
        opacity: 0.6;
      }
      .outline-node.${DROP_TARGET_CLASS} {
        background: var(--focus-bg, rgba(100, 149, 237, 0.15));
        border-radius: 4px;
      }
    `;
    document.head.appendChild(styleEl);
    logDebug("drag CSS injected");

    draggedNodeId = null;

    const onDragStart = (e: DragEvent) => {
      const nodeEl = (e.target as HTMLElement).closest(".outline-node[data-node-id]");
      if (!nodeEl) {
        logDebug(`dragstart: no .outline-node[data-node-id] ancestor for target ${(e.target as HTMLElement).tagName}.${(e.target as HTMLElement).className}`);
        return;
      }
      draggedNodeId = (nodeEl as HTMLElement).dataset.nodeId ?? null;
      if (draggedNodeId) {
        e.dataTransfer!.setData("text/plain", draggedNodeId);
        e.dataTransfer!.effectAllowed = "move";
        dragoverLoggedThisDrag = false;
        logDebug(`dragstart OK: node=${draggedNodeId} target.tag=${(e.target as HTMLElement).tagName}`);
      } else {
        logDebug(`dragstart FAIL: nodeEl found but dataset.nodeId is null; classes=${(nodeEl as HTMLElement).className}`);
      }
    };

    const onDragOver = (e: DragEvent) => {
      if (!draggedNodeId) {
        logDebug(`dragover SKIP: no draggedNodeId (dragstart never set it?)`);
        return;
      }
      if (!dragoverLoggedThisDrag) {
        logDebug(`dragover FIRST: preventDefault called, target=${(e.target as HTMLElement).tagName}.${(e.target as HTMLElement).className}`);
        dragoverLoggedThisDrag = true;
      }
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";

      // Clear previous target highlight
      document.querySelectorAll(`.${DROP_TARGET_CLASS}`).forEach((el) => el.classList.remove(DROP_TARGET_CLASS));

      const targetEl = (e.target as HTMLElement).closest(".outline-node[data-node-id]");
      if (!targetEl) return;

      const targetId = (targetEl as HTMLElement).dataset.nodeId!;
      if (targetId === draggedNodeId) return;

      // Only valid move: reparent onto another node. Reject if target is under dragged (would create cycle).
      const nodes = store.getState().tree ?? [];
      if (isDescendantOf(nodes, targetId, draggedNodeId)) return;

      (targetEl as HTMLElement).classList.add(DROP_TARGET_CLASS);
    };

    const onDragEnd = () => {
      if (!dragoverLoggedThisDrag && draggedNodeId) {
        logDebug(`dragend: draggedNodeId=${draggedNodeId} but no dragover ever fired — drag was cancelled or rejected`);
      }
      document.querySelectorAll(`.${DROP_TARGET_CLASS}`).forEach((el) => el.classList.remove(DROP_TARGET_CLASS));
      draggedNodeId = null;
      dragoverLoggedThisDrag = false;
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      document.querySelectorAll(`.${DROP_TARGET_CLASS}`).forEach((el) => el.classList.remove(DROP_TARGET_CLASS));

      const targetEl = (e.target as HTMLElement).closest(".outline-node[data-node-id]");
      if (!targetEl || !draggedNodeId) return;

      const targetId = (targetEl as HTMLElement).dataset.nodeId!;
      if (draggedNodeId === targetId) return;

      // Cycle check
      const nodes = store.getState().tree ?? [];
      if (isDescendantOf(nodes, targetId, draggedNodeId)) return;

      // Single valid move: dragged becomes first child of target
      void ctx.emit("action:moveNodeTo", draggedNodeId, targetId);
      draggedNodeId = null;
    };

    dragHandlers = {
      onDragStart: onDragStart as EventListener,
      onDragOver: onDragOver as EventListener,
      onDragEnd,
      onDrop: onDrop as EventListener,
    };

    const attachListeners = () => {
      if (listenersAttached || !dragHandlers) {
        logDebug(`attachListeners SKIP: listenersAttached=${listenersAttached} dragHandlers=${!!dragHandlers}`);
        return;
      }
      treeContainer = document.querySelector(".outline-tree") ?? document.querySelector(".app");
      if (!treeContainer) {
        logDebug(`attachListeners FAIL: no .outline-tree or .app in DOM`);
        return;
      }
      logDebug(`attachListeners OK: container=${treeContainer.tagName}.${(treeContainer as HTMLElement).className}`);
      treeContainer.addEventListener("dragstart", dragHandlers.onDragStart);
      treeContainer.addEventListener("dragover", dragHandlers.onDragOver);
      treeContainer.addEventListener("dragend", dragHandlers.onDragEnd);
      treeContainer.addEventListener("drop", dragHandlers.onDrop);
      listenersAttached = true;
      logDebug(`listeners attached: dragstart, dragover, dragend, drop`);
    };

    attachListeners();
    mountTimer = setTimeout(attachListeners, 500);

    // Register debug log dump command
    ctx.registerCommand({
      id: "dnd-dump-logs",
      name: "Dump Drag-Drop Debug Logs",
      execute: () => {
        const blob = new Blob([debugLogs.join("\n")], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `dnd-debug-${Date.now()}.txt`;
        a.click();
      },
    });
    logDebug("dump-logs command registered");

    observer = new MutationObserver(() => {
      if (!listenersAttached && document.querySelector(".outline-tree")) {
        attachListeners();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },

  async onUnload() {
    setDragDropEnabled(false);
    if (mountTimer) {
      clearTimeout(mountTimer);
      mountTimer = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (treeContainer && listenersAttached && dragHandlers) {
      treeContainer.removeEventListener("dragstart", dragHandlers.onDragStart);
      treeContainer.removeEventListener("dragover", dragHandlers.onDragOver);
      treeContainer.removeEventListener("dragend", dragHandlers.onDragEnd);
      treeContainer.removeEventListener("drop", dragHandlers.onDrop);
      treeContainer = null;
      listenersAttached = false;
      dragHandlers = null;
    }
    if (styleEl?.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
      styleEl = null;
    }
  },
};

export default plugin;
