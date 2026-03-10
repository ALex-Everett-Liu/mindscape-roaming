import type { OutlineTreeNode, OutlineNode } from "../../shared/types";
import { api } from "../rpc/api";

export interface AppState {
  tree: OutlineTreeNode[];
  zoomedNodeId: string | null;
  breadcrumbs: OutlineNode[];
  focusedNodeId: string | null;
  searchQuery: string;
  searchResults: OutlineNode[];
  isSearching: boolean;
  loading: boolean;
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
  };

  private listeners: Set<Listener> = new Set();

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

  async loadTree(): Promise<void> {
    this.update({ loading: true });

    try {
      const parentId = this.state.zoomedNodeId;
      const result = await Promise.race([
        api.getSubtree({ parent_id: parentId }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Load timeout")), 15000)
        ),
      ]);

      if (result.success) {
        this.update({ tree: result.data! });

        if (parentId) {
          const ancestors = await api.getAncestors(parentId);
          const zoomedNode = await api.getNode(parentId);
          if (ancestors.success && zoomedNode.success) {
            this.update({
              breadcrumbs: [...ancestors.data!, zoomedNode.data!],
            });
          }
        } else {
          this.update({ breadcrumbs: [] });
        }
      }
    } catch (err) {
      console.error("Failed to load tree:", err);
    } finally {
      this.update({ loading: false });
    }
  }

  async createNode(afterId: string | null, parentId: string | null): Promise<OutlineNode | null> {
    const params = afterId
      ? { content: "", parent_id: parentId, insertAfterId: afterId }
      : { content: "", parent_id: parentId };

    const result = await api.createNode(params);
    if (result.success) {
      await this.loadTree();
      this.update({ focusedNodeId: result.data!.id });
      return result.data!;
    }
    return null;
  }

  async updateContent(id: string, content: string): Promise<void> {
    await api.updateNode({ id, content });
    this.updateNodeInTree(id, { content });
  }

  async toggleExpanded(id: string): Promise<void> {
    const node = this.findNodeInTree(id);
    if (!node) return;

    const newExpanded = !node.is_expanded;
    await api.updateNode({ id, is_expanded: newExpanded });
    this.updateNodeInTree(id, { is_expanded: newExpanded });
  }

  async indentNode(id: string): Promise<void> {
    const result = await api.indentNode({ id });
    if (result.success && result.data) {
      await this.loadTree();
      this.update({ focusedNodeId: id });
    }
  }

  async outdentNode(id: string): Promise<void> {
    const result = await api.outdentNode({ id });
    if (result.success && result.data) {
      await this.loadTree();
      this.update({ focusedNodeId: id });
    }
  }

  async deleteNode(id: string): Promise<void> {
    await api.deleteNode({ id, deleteChildren: true });
    await this.loadTree();
  }

  async moveNode(
    id: string,
    newParentId: string | null,
    newPosition: number
  ): Promise<void> {
    await api.moveNode({ id, new_parent_id: newParentId, new_position: newPosition });
    await this.loadTree();
  }

  async zoomIn(nodeId: string): Promise<void> {
    this.update({ zoomedNodeId: nodeId });
    await this.loadTree();
  }

  async zoomOut(): Promise<void> {
    if (this.state.breadcrumbs.length > 1) {
      const parent = this.state.breadcrumbs[this.state.breadcrumbs.length - 2];
      this.update({ zoomedNodeId: parent.id });
    } else {
      this.update({ zoomedNodeId: null });
    }
    await this.loadTree();
  }

  async zoomToRoot(): Promise<void> {
    this.update({ zoomedNodeId: null });
    await this.loadTree();
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
