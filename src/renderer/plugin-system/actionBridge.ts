/**
 * Bridges action:* events from plugins to the store.
 * Subscribes to the event bus and invokes the appropriate store methods.
 */
import type { OutlineTreeNode } from "../../shared/types";
import type { EventBus } from "./EventBus";

export interface ActionBridgeStore {
  getState(): { tree: OutlineTreeNode[]; zoomedNodeId: string | null };
  createNode(afterId: string | null, parentId: string | null): Promise<unknown>;
  indentNode(id: string): Promise<void>;
  outdentNode(id: string): Promise<void>;
  deleteNode(id: string): Promise<void>;
  moveNode(id: string, newParentId: string | null, newPosition: number): Promise<void>;
  focusPrevious(id: string): void;
  focusNext(id: string): void;
}

export function setupActionBridge(eventBus: EventBus, store: ActionBridgeStore): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(
    eventBus.on("action:createNodeAfter", async (nodeId: unknown) => {
      const id = String(nodeId);
      const node = store.getState().tree ? findNode(store.getState().tree, id) : null;
      const parentId = node ? node.parent_id : store.getState().zoomedNodeId;
      await store.createNode(id, parentId);
    })
  );

  unsubs.push(
    eventBus.on("action:createRootNode", async () => {
      await store.createNode(null, store.getState().zoomedNodeId);
    })
  );

  unsubs.push(
    eventBus.on("action:indentNode", async (nodeId: unknown) => {
      await store.indentNode(String(nodeId));
    })
  );

  unsubs.push(
    eventBus.on("action:outdentNode", async (nodeId: unknown) => {
      await store.outdentNode(String(nodeId));
    })
  );

  unsubs.push(
    eventBus.on("action:deleteNode", async (nodeId: unknown) => {
      await store.deleteNode(String(nodeId));
    })
  );

  unsubs.push(
    eventBus.on("action:moveNodeUp", async (nodeId: unknown) => {
      const id = String(nodeId);
      const node = findNode(store.getState().tree, id);
      if (node && node.position > 0) {
        await store.moveNode(id, node.parent_id, node.position - 1);
      }
    })
  );

  unsubs.push(
    eventBus.on("action:moveNodeDown", async (nodeId: unknown) => {
      const id = String(nodeId);
      const node = findNode(store.getState().tree, id);
      if (node) {
        const siblings = getSiblings(store.getState().tree, id);
        if (siblings && node.position < siblings.length - 1) {
          await store.moveNode(id, node.parent_id, node.position + 1);
        }
      }
    })
  );

  unsubs.push(
    eventBus.on("action:focusPrevious", (nodeId: unknown) => {
      store.focusPrevious(String(nodeId));
    })
  );

  unsubs.push(
    eventBus.on("action:focusNext", (nodeId: unknown) => {
      store.focusNext(String(nodeId));
    })
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

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

function getSiblings(nodes: OutlineTreeNode[], nodeId: string): OutlineTreeNode[] | null {
  for (const node of nodes) {
    if (node.id === nodeId) return nodes;
    if (node.children.length > 0) {
      const s = getSiblings(node.children, nodeId);
      if (s) return s;
    }
  }
  return null;
}
