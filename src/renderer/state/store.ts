import type { OutlineTreeNode, OutlineNode } from "../../shared/types";
import { api } from "../rpc/api";
import { saveStateManager } from "./saveStateManager";

export interface UnsavedNodeChange {
  content?: { current: string; original: string };
  is_expanded?: { current: boolean; original: boolean };
}

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
  private listeners = new Set<Listener>();
  private loadVersion = 0;

  constructor() {
    saveStateManager.register("outliner", {
      getChanges: () => this.unsavedChanges as Map<string, unknown>,
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
    return this.unsavedChanges.size > 0;
  }

  getUnsavedCount(): number {
    return this.unsavedChanges.size;
  }

  isNodeUnsaved(nodeId: string): boolean {
    return this.unsavedChanges.has(nodeId);
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
      } else if (!result.success) {
        this.update({ tree: [] });
      }

      // Load breadcrumbs in background — never block loading state on these
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
    } finally {
      if (showLoading && version === this.loadVersion) {
        this.update({ loading: false });
      }
    }
  }

  async createNode(afterId: string | null, parentId: string | null): Promise<OutlineNode | null> {
    const params = afterId
      ? { content: "", parent_id: parentId, insertAfterId: afterId }
      : { content: "", parent_id: parentId };

    const result = await api.createNode(params);
    if (result.success) {
      await this.loadTree(false);
      this.update({ focusedNodeId: result.data!.id });
      return result.data!;
    }
    console.error("createNode failed:", result.error);
    return null;
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

  async indentNode(id: string): Promise<void> {
    const result = await api.indentNode({ id });
    if (result.success && result.data) {
      await this.loadTree(false);
      this.update({ focusedNodeId: id });
    }
  }

  async outdentNode(id: string): Promise<void> {
    const result = await api.outdentNode({ id });
    if (result.success && result.data) {
      await this.loadTree(false);
      this.update({ focusedNodeId: id });
    }
  }

  async deleteNode(id: string): Promise<void> {
    const result = await api.deleteNode({ id, deleteChildren: true });
    if (result.success) {
      this.unsavedChanges.delete(id);
      this.notifySaveState();
      await this.loadTree(false);
    }
  }

  async moveNode(
    id: string,
    newParentId: string | null,
    newPosition: number
  ): Promise<void> {
    const result = await api.moveNode({ id, new_parent_id: newParentId, new_position: newPosition });
    if (result.success) {
      await this.loadTree(false);
    }
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

    this.update({ searchQuery: query, isSearching: true });
    const result = await api.search({ query, limit: 50 });

    if (result.success) {
      this.update({ searchResults: result.data!, isSearching: false });
    }
  }

  setFocusedNode(id: string | null): void {
    this.update({ focusedNodeId: id });
  }

  async saveAll(): Promise<{ success: boolean; savedCount: number; error?: string }> {
    if (this.unsavedChanges.size === 0) {
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

    this.update({
      saveInProgress: false,
      unsavedCount: this.unsavedChanges.size,
      lastSaveSuccess: firstError ? null : savedCount,
      lastSaveError: firstError,
    });
    this.notifySaveState();

    return {
      success: !firstError,
      savedCount,
      error: firstError ?? undefined,
    };
  }

  async discardAll(): Promise<{ success: boolean; discardedCount: number }> {
    const count = this.unsavedChanges.size;
    if (count === 0) {
      return { success: true, discardedCount: 0 };
    }

    this.update({ discardInProgress: true });

    for (const [nodeId, change] of this.unsavedChanges) {
      const restore: Partial<OutlineTreeNode> = {};
      if (change.content) restore.content = change.content.original;
      if (change.is_expanded !== undefined) restore.is_expanded = change.is_expanded.original;
      if (Object.keys(restore).length > 0) {
        this.updateNodeInTree(nodeId, restore);
      }
    }

    this.unsavedChanges.clear();
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

  private updateNodeInTree(
    id: string,
    updates: Partial<OutlineTreeNode>
  ): void {
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
