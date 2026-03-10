import type { OutlineTreeNode, OutlineNode } from "../../shared/types";
import { api } from "../rpc/api";
import { saveStateManager } from "./saveStateManager";

export interface AppState {
  tree: OutlineTreeNode[];
  zoomedNodeId: string | null;
  breadcrumbs: OutlineNode[];
  focusedNodeId: string | null;
  searchQuery: string;
  searchResults: OutlineNode[];
  isSearching: boolean;
  searchAvailable: boolean;
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
    searchAvailable: false,
    loading: true,
    unsavedCount: 0,
    saveInProgress: false,
    discardInProgress: false,
    lastSaveError: null,
    lastSaveSuccess: null,
  };

  private modifiedNodeIds = new Set<string>();
  private listeners = new Set<Listener>();
  private loadVersion = 0;

  constructor() {
    saveStateManager.register("outliner", {
      getChanges: () => new Map([...this.modifiedNodeIds].map((id) => [id, true])),
      save: () => this.persistChanges(),
      discard: () => this.revertChanges(),
    });

    saveStateManager.onStateChange((hasUnsaved, count) => {
      this.update({ unsavedCount: count });
      try {
        api.reportUnsavedState?.(hasUnsaved);
      } catch {
        /* API not initialized yet */
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
    return this.modifiedNodeIds.size > 0;
  }

  getUnsavedCount(): number {
    return this.modifiedNodeIds.size;
  }

  isNodeUnsaved(nodeId: string): boolean {
    return this.modifiedNodeIds.has(nodeId);
  }

  private markModified(nodeId: string): void {
    this.modifiedNodeIds.add(nodeId);
    saveStateManager.notifyListeners();
  }

  private clearModified(): void {
    this.modifiedNodeIds.clear();
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
        console.log("[loadTree] Got", result.data.length, "root nodes");
        this.update({ tree: result.data });
      } else if (!result.success) {
        console.warn("[loadTree] getSubtree failed:", result);
        this.update({ tree: [] });
      }

      if (parentId) {
        Promise.all([api.getAncestors(parentId), api.getNode(parentId)])
          .then(([ancestors, zoomedNode]) => {
            if (ancestors.success && zoomedNode.success && ancestors.data && zoomedNode.data) {
              this.update({ breadcrumbs: [...ancestors.data, zoomedNode.data] });
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
      this.markModified(result.data!.id);
      await this.loadTree(false);
      this.update({ focusedNodeId: result.data!.id });
      return result.data!;
    }
    console.error("createNode failed:", result.error);
    return null;
  }

  updateContent(id: string, content: string): void {
    const node = this.findNodeInTree(id);
    if (!node) return;
    if (node.content === content) return;

    this.updateNodeInTree(id, { content });
    this.markModified(id);

    api.updateNode({ id, content }).then((result) => {
      if (!result.success) console.error("updateContent failed:", result.error);
    });
  }

  toggleExpanded(id: string): void {
    const node = this.findNodeInTree(id);
    if (!node) return;
    const newExpanded = !node.is_expanded;

    this.updateNodeInTree(id, { is_expanded: newExpanded });
    this.markModified(id);

    api.updateNode({ id, is_expanded: newExpanded }).then((result) => {
      if (!result.success) console.error("toggleExpanded failed:", result.error);
    });
  }

  async indentNode(id: string): Promise<void> {
    const result = await api.indentNode({ id });
    if (result.success && result.data) {
      this.markModified(id);
      await this.loadTree(false);
      this.update({ focusedNodeId: id });
    }
  }

  async outdentNode(id: string): Promise<void> {
    const result = await api.outdentNode({ id });
    if (result.success && result.data) {
      this.markModified(id);
      await this.loadTree(false);
      this.update({ focusedNodeId: id });
    }
  }

  async deleteNode(id: string): Promise<void> {
    const result = await api.deleteNode({ id, deleteChildren: true });
    if (result.success) {
      this.modifiedNodeIds.delete(id);
      saveStateManager.notifyListeners();
      await this.loadTree(false);
    }
  }

  async moveNode(id: string, newParentId: string | null, newPosition: number): Promise<void> {
    const result = await api.moveNode({ id, new_parent_id: newParentId, new_position: newPosition });
    if (result.success) {
      this.markModified(id);
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
    this.update({ searchQuery: query, searchResults: [], isSearching: true });
    const result = await api.search({ query, limit: 50 });
    if (result.success) {
      this.update({ searchResults: result.data!, isSearching: false });
    } else {
      this.update({ searchResults: [], isSearching: false });
    }
  }

  async refreshSearchAvailability(): Promise<void> {
    const res = await api.listPlugins();
    if (res.success && res.data) {
      const available = res.data.some(
        (p) => p.id === "core-fts-search" && p.loaded
      );
      this.update({ searchAvailable: available });
    }
  }

  setFocusedNode(id: string | null): void {
    this.update({ focusedNodeId: id });
  }

  async saveAll(): Promise<{ success: boolean; savedCount: number; error?: string }> {
    if (this.modifiedNodeIds.size === 0) {
      return { success: true, savedCount: 0 };
    }

    this.update({ saveInProgress: true, lastSaveError: null, lastSaveSuccess: null });

    const count = this.modifiedNodeIds.size;
    const result = await api.commitSave();

    this.clearModified();
    this.update({
      saveInProgress: false,
      unsavedCount: 0,
      lastSaveSuccess: result.success ? count : null,
      lastSaveError: result.success ? null : (result as { error?: string }).error ?? "Save failed",
    });
    saveStateManager.notifyListeners();

    return {
      success: result.success,
      savedCount: result.success ? count : 0,
      error: result.success ? undefined : (result as { error?: string }).error,
    };
  }

  async discardAll(): Promise<{ success: boolean; discardedCount: number }> {
    const count = this.modifiedNodeIds.size;
    console.log("[Discard] discardAll called, modifiedCount:", count);
    if (count === 0) {
      console.log("[Discard] No changes, skipping");
      return { success: true, discardedCount: 0 };
    }

    this.update({ discardInProgress: true });
    console.log("[Discard] Calling api.restoreFromBackup()...");

    try {
      const result = await api.restoreFromBackup();
      console.log("[Discard] RPC returned:", JSON.stringify(result));
      const ok = (result as { success?: boolean }).success === true;

      this.update({ discardInProgress: false });

      if (ok) {
        console.log("[Discard] Success, clearing modified and reloading tree");
        this.clearModified();
        this.update({ unsavedCount: 0, lastSaveError: null, lastSaveSuccess: null });
        saveStateManager.notifyListeners();
        // Force full reload: clear tree, show loading, yield for main to settle, fetch from restored DB
        this.update({ tree: [], loading: true });
        await new Promise((r) => setTimeout(r, 100));
        await this.loadTree(true);
        console.log("[Discard] Done");
        return { success: true, discardedCount: count };
      } else {
        const err = (result as { error?: string }).error;
        console.error("[Discard] Main returned success=false:", err);
        saveStateManager.notifyListeners();
        alert(`Discard failed: ${err ?? "Unknown error"}`);
        return { success: false, discardedCount: 0 };
      }
    } catch (e) {
      console.error("[Discard] Exception:", e);
      this.update({
        discardInProgress: false,
        lastSaveError: (e as Error)?.message ?? "Discard failed",
      });
      saveStateManager.notifyListeners();
      alert(`Discard failed: ${(e as Error)?.message ?? "Unknown error"}`);
      return { success: false, discardedCount: 0 };
    }
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
      if (node.id === id) return { ...node, ...updates };
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
