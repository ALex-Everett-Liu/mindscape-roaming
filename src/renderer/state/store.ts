import type { OutlineTreeNode, OutlineNode } from "../../shared/types";
import { api } from "../rpc/api";
import { saveStateManager } from "./saveStateManager";
import {
  addNodeToTree,
  createTreeNode,
  cloneTree,
  moveNodeInTree,
  removeNodeFromTree,
} from "./treeUtils";

export interface UnsavedNodeChange {
  content?: { current: string; original: string };
  is_expanded?: { current: boolean; original: boolean };
}

export type StructuralChange =
  | { type: "create"; id: string; content: string; parent_id: string | null; insertAfterId: string | null }
  | { type: "move"; id: string; new_parent_id: string | null; new_position: number }
  | { type: "delete"; id: string; deleteChildren: boolean };

export interface AppState {
  tree: OutlineTreeNode[];
  zoomedNodeId: string | null;
  breadcrumbs: OutlineNode[];
  focusedNodeId: string | null;
  searchQuery: string;
  searchResults: OutlineNode[];
  isSearching: boolean;
  loading: boolean;
  unsavedCount: number;
  saveInProgress: boolean;
  discardInProgress: boolean;
  lastSaveError: string | null;
  lastSaveSuccess: number | null;
}

type Listener = (state: AppState) => void;

function randomId(): string {
  return crypto.randomUUID();
}

class Store {
  private state: AppState = {
    tree: [],
    zoomedNodeId: null,
    breadcrumbs: [],
    focusedNodeId: null,
    searchQuery: "",
    searchResults: [],
    isSearching: false,
    loading: true,
    unsavedCount: 0,
    saveInProgress: false,
    discardInProgress: false,
    lastSaveError: null,
    lastSaveSuccess: null,
  };

  private unsavedChanges = new Map<string, UnsavedNodeChange>();
  private structuralChanges: StructuralChange[] = [];
  private baselineTree: OutlineTreeNode[] = [];
  private listeners = new Set<Listener>();
  private loadVersion = 0;

  constructor() {
    saveStateManager.register("outliner", {
      getChanges: () => this.getCombinedChanges(),
      save: () => this.persistChanges(),
      discard: () => this.revertChanges(),
    });

    saveStateManager.onStateChange((hasUnsaved, count) => {
      this.update({ unsavedCount: count });
      try {
        api.reportUnsavedState?.(hasUnsaved);
      } catch {
        /* API not initialized yet (store loads before initApi) */
      }
    });
  }

  private getCombinedChanges(): Map<string, unknown> {
    const m = new Map<string, unknown>();
    for (const [k, v] of this.unsavedChanges) m.set(k, v);
    this.structuralChanges.forEach((_, i) => m.set(`__struct:${i}`, true));
    return m;
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private update(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  hasUnsavedChanges(): boolean {
    return this.unsavedChanges.size > 0 || this.structuralChanges.length > 0;
  }

  getUnsavedCount(): number {
    return this.unsavedChanges.size + this.structuralChanges.length;
  }

  isNodeUnsaved(nodeId: string): boolean {
    if (this.unsavedChanges.has(nodeId)) return true;
    return this.structuralChanges.some(
      (s) =>
        (s.type === "create" && s.id === nodeId) ||
        (s.type === "move" && s.id === nodeId) ||
        (s.type === "delete" && s.id === nodeId)
    );
  }

  private notifySaveState(): void {
    saveStateManager.notifyListeners();
  }

  async loadTree(showLoading = true): Promise<void> {
    const version = ++this.loadVersion;
    if (showLoading) this.update({ loading: true });

    try {
      const parentId = this.state.zoomedNodeId;
      const result = await Promise.race([
        api.getSubtree({ parent_id: parentId }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Load timeout")), 15000)
        ),
      ]);

      if (result.success && result.data) {
        this.update({ tree: result.data });
        this.baselineTree = cloneTree(result.data);
      } else if (!result.success) {
        this.update({ tree: [] });
        this.baselineTree = [];
      }

      if (parentId) {
        Promise.all([api.getAncestors(parentId), api.getNode(parentId)])
          .then(([ancestors, zoomedNode]) => {
            if (ancestors.success && zoomedNode.success && ancestors.data && zoomedNode.data) {
              this.update({
                breadcrumbs: [...ancestors.data, zoomedNode.data],
              });
            }
          })
          .catch((err) => console.error("Failed to load breadcrumbs:", err));
      } else {
        this.update({ breadcrumbs: [] });
      }
    } catch (err) {
      console.error("Failed to load tree:", err);
      this.update({ tree: [] });
      this.baselineTree = [];
    } finally {
      if (showLoading && version === this.loadVersion) {
        this.update({ loading: false });
      }
    }
  }

  /** Local-only. No DB write until Save. */
  createNode(afterId: string | null, parentId: string | null): OutlineNode | null {
    const id = randomId();
    const insertAfterId = afterId;
    const parent_id = afterId
      ? (this.findNodeInTree(afterId)?.parent_id ?? parentId)
      : parentId;

    const newNode = createTreeNode(id, "", parent_id, 0, 0);
    const newTree = addNodeToTree(
      this.state.tree,
      newNode,
      parent_id,
      insertAfterId,
      this.state.zoomedNodeId
    );
    if (newTree === this.state.tree) return null;

    this.structuralChanges.push({
      type: "create",
      id,
      content: "",
      parent_id,
      insertAfterId,
    });
    this.update({ tree: newTree });
    this.update({ focusedNodeId: id });
    this.notifySaveState();
    return newNode;
  }

  /** Manual save only — updates in-memory tree and tracks change. No persistence until Save. */
  updateContent(id: string, content: string): void {
    const node = this.findNodeInTree(id);
    if (!node) return;

    const existing = this.unsavedChanges.get(id);
    const originalContent = existing?.content?.original ?? node.content;

    if (content === originalContent) {
      if (existing) {
        const updated = { ...existing };
        delete updated.content;
        if (Object.keys(updated).length === 0) {
          this.unsavedChanges.delete(id);
        } else {
          this.unsavedChanges.set(id, updated);
        }
      }
    } else {
      this.unsavedChanges.set(id, {
        ...existing,
        content: { current: content, original: originalContent },
      });
    }

    this.updateNodeInTree(id, { content });
    this.notifySaveState();
  }

  /** Manual save only — tracks expand/collapse. No persistence until Save. */
  toggleExpanded(id: string): void {
    const node = this.findNodeInTree(id);
    if (!node) return;

    const newExpanded = !node.is_expanded;
    const existing = this.unsavedChanges.get(id);
    const originalExpanded = existing?.is_expanded?.original ?? node.is_expanded;

    if (newExpanded === originalExpanded) {
      if (existing) {
        const updated = { ...existing };
        delete updated.is_expanded;
        if (Object.keys(updated).length === 0) {
          this.unsavedChanges.delete(id);
        } else {
          this.unsavedChanges.set(id, updated);
        }
      }
    } else {
      this.unsavedChanges.set(id, {
        ...existing,
        is_expanded: { current: newExpanded, original: originalExpanded },
      });
    }

    this.updateNodeInTree(id, { is_expanded: newExpanded });
    this.notifySaveState();
  }

  /** Local-only. No DB write until Save. */
  indentNode(id: string): void {
    const loc = this.findLocation(id);
    if (!loc || loc.index === 0) return;
    const prevSibling = loc.siblings[loc.index - 1];
    const new_parent_id = prevSibling.id;
    const new_position = prevSibling.children.length;
    const newTree = moveNodeInTree(this.state.tree, id, new_parent_id, new_position);
    this.structuralChanges.push({ type: "move", id, new_parent_id, new_position });
    this.update({ tree: newTree });
    this.update({ focusedNodeId: id });
    this.notifySaveState();
  }

  /** Local-only. No DB write until Save. */
  outdentNode(id: string): void {
    const loc = this.findLocation(id);
    if (!loc || loc.node.parent_id === null) return;
    const parent = this.findNodeInTree(loc.node.parent_id);
    if (!parent) return;
    const new_parent_id = parent.parent_id;
    const new_position = parent.position + 1;
    const newTree = moveNodeInTree(this.state.tree, id, new_parent_id, new_position);
    this.structuralChanges.push({ type: "move", id, new_parent_id, new_position });
    this.update({ tree: newTree });
    this.update({ focusedNodeId: id });
    this.notifySaveState();
  }

  /** Local-only. No DB write until Save. */
  deleteNode(id: string): void {
    const newTree = removeNodeFromTree(this.state.tree, id, true);
    this.structuralChanges.push({ type: "delete", id, deleteChildren: true });
    this.unsavedChanges.delete(id);
    this.update({ tree: newTree });
    this.update({ focusedNodeId: null });
    this.notifySaveState();
  }

  /** Local-only. No DB write until Save. */
  moveNode(id: string, newParentId: string | null, newPosition: number): void {
    const newTree = moveNodeInTree(this.state.tree, id, newParentId, newPosition);
    this.structuralChanges.push({ type: "move", id, new_parent_id: newParentId, new_position: newPosition });
    this.update({ tree: newTree });
    this.notifySaveState();
  }

  private findLocation(id: string): {
    node: OutlineTreeNode;
    siblings: OutlineTreeNode[];
    index: number;
  } | null {
    const visit = (
      nodes: OutlineTreeNode[],
      siblings: OutlineTreeNode[]
    ): typeof result | null => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) return { node: nodes[i], siblings, index: i };
        const found = visit(nodes[i].children, nodes[i].children);
        if (found) return found;
      }
      return null;
    };
    return visit(this.state.tree, this.state.tree);
  }

  async zoomIn(nodeId: string): Promise<void> {
    this.update({ zoomedNodeId: nodeId });
    await this.loadTree(false);
  }

  async zoomOut(): Promise<void> {
    if (this.state.breadcrumbs.length > 1) {
      const parent = this.state.breadcrumbs[this.state.breadcrumbs.length - 2];
      this.update({ zoomedNodeId: parent.id });
    } else {
      this.update({ zoomedNodeId: null });
    }
    await this.loadTree(false);
  }

  async zoomToRoot(): Promise<void> {
    this.update({ zoomedNodeId: null });
    await this.loadTree(false);
  }

  async search(query: string): Promise<void> {
    if (!query.trim()) {
      this.update({ searchQuery: "", searchResults: [], isSearching: false });
      return;
    }

    this.update({ searchQuery: query, searchResults: [], isSearching: true });
    const result = await api.search({ query, limit: 50 });

    if (result.success) {
      this.update({ searchResults: result.data!, isSearching: false });
    }
  }

  setFocusedNode(id: string | null): void {
    this.update({ focusedNodeId: id });
  }

  async saveAll(): Promise<{ success: boolean; savedCount: number; error?: string }> {
    if (this.unsavedChanges.size === 0 && this.structuralChanges.length === 0) {
      return { success: true, savedCount: 0 };
    }

    this.update({ saveInProgress: true, lastSaveError: null, lastSaveSuccess: null });

    let savedCount = 0;
    let firstError: string | null = null;

    for (const [nodeId, change] of this.unsavedChanges) {
      const updates: { content?: string; is_expanded?: boolean } = {};
      if (change.content) updates.content = change.content.current;
      if (change.is_expanded !== undefined) updates.is_expanded = change.is_expanded.current;

      if (Object.keys(updates).length === 0) continue;

      const result = await api.updateNode({ id: nodeId, ...updates });
      if (result.success) {
        this.unsavedChanges.delete(nodeId);
        savedCount++;
      } else if (!firstError) {
        firstError = result.error ?? "Unknown error";
      }
    }

    for (const op of this.structuralChanges) {
      if (firstError) break;
      if (op.type === "create") {
        const node = this.findNodeInTree(op.id);
        const content = node?.content ?? op.content;
        const params = op.insertAfterId
          ? { content, parent_id: op.parent_id, insertAfterId: op.insertAfterId, id: op.id }
          : { content, parent_id: op.parent_id, id: op.id };
        const result = await api.createNode(params);
        if (result.success) {
          savedCount++;
        } else if (!firstError) {
          firstError = result.error ?? "Unknown error";
        }
      } else if (op.type === "move") {
        const result = await api.moveNode({
          id: op.id,
          new_parent_id: op.new_parent_id,
          new_position: op.new_position,
        });
        if (result.success) {
          savedCount++;
        } else if (!firstError) {
          firstError = result.error ?? "Unknown error";
        }
      } else if (op.type === "delete") {
        const result = await api.deleteNode({ id: op.id, deleteChildren: op.deleteChildren });
        if (result.success) {
          savedCount++;
        } else if (!firstError) {
          firstError = result.error ?? "Unknown error";
        }
      }
    }

    if (!firstError) {
      this.structuralChanges.length = 0;
    }

    this.update({
      saveInProgress: false,
      unsavedCount: this.unsavedChanges.size + this.structuralChanges.length,
      lastSaveSuccess: firstError ? null : savedCount,
      lastSaveError: firstError,
    });
    this.notifySaveState();

    await this.loadTree(false);
    return {
      success: !firstError,
      savedCount,
      error: firstError ?? undefined,
    };
  }

  async discardAll(): Promise<{ success: boolean; discardedCount: number }> {
    const count = this.unsavedChanges.size + this.structuralChanges.length;
    if (count === 0) {
      return { success: true, discardedCount: 0 };
    }

    this.update({ discardInProgress: true });

    this.unsavedChanges.clear();
    this.structuralChanges.length = 0;
    this.update({ tree: cloneTree(this.baselineTree) });

    this.update({
      discardInProgress: false,
      unsavedCount: 0,
      lastSaveError: null,
      lastSaveSuccess: null,
    });
    this.notifySaveState();

    await this.loadTree(false);
    return { success: true, discardedCount: count };
  }

  clearSaveFeedback(): void {
    this.update({ lastSaveError: null, lastSaveSuccess: null });
  }

  private async persistChanges(): Promise<{
    success: boolean;
    savedCount: number;
    error?: string;
  }> {
    return this.saveAll();
  }

  private async revertChanges(): Promise<{
    success: boolean;
    discardedCount: number;
  }> {
    return this.discardAll();
  }

  private findNodeInTree(
    id: string,
    nodes: OutlineTreeNode[] = this.state.tree
  ): OutlineTreeNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = this.findNodeInTree(id, node.children);
      if (found) return found;
    }
    return null;
  }

  private updateNodeInTree(id: string, updates: Partial<OutlineTreeNode>): void {
    const updatedTree = this.deepUpdateTree(this.state.tree, id, updates);
    this.update({ tree: updatedTree });
  }

  private deepUpdateTree(
    nodes: OutlineTreeNode[],
    id: string,
    updates: Partial<OutlineTreeNode>
  ): OutlineTreeNode[] {
    return nodes.map((node) => {
      if (node.id === id) {
        return { ...node, ...updates };
      }
      if (node.children.length > 0) {
        return {
          ...node,
          children: this.deepUpdateTree(node.children, id, updates),
        };
      }
      return node;
    });
  }
}

export const store = new Store();
