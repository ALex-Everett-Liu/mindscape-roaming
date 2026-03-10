import type { Database } from "bun:sqlite";
import { NodeRepository } from "./repository";
import type {
  OutlineNode,
  OutlineTreeNode,
  CreateNodeParams,
  UpdateNodeParams,
  MoveNodeParams,
  IndentNodeParams,
  OutdentNodeParams,
  DeleteNodeParams,
  GetSubtreeParams,
  RpcResult,
} from "../../../shared/types";

export class OutlineService {
  private repo: NodeRepository;

  constructor(db: Database) {
    this.repo = new NodeRepository(db);
  }

  getFullTree(): RpcResult<OutlineTreeNode[]> {
    try {
      return { success: true, data: this.repo.getSubtree(null, -1) };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  getSubtree(params: GetSubtreeParams): RpcResult<OutlineTreeNode[]> {
    try {
      return {
        success: true,
        data: this.repo.getSubtree(params.parent_id, params.depth ?? -1),
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  getNode(id: string): RpcResult<OutlineNode> {
    try {
      const node = this.repo.getById(id);
      if (!node) return { success: false, error: "Node not found" };
      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  getAncestors(nodeId: string): RpcResult<OutlineNode[]> {
    try {
      return { success: true, data: this.repo.getAncestors(nodeId) };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  createNode(params: CreateNodeParams): RpcResult<OutlineNode> {
    try {
      const node = params.insertAfterId
        ? this.repo.createAfter(params.content, params.insertAfterId, params.id)
        : this.repo.create(params.content, params.parent_id, params.position, params.id);
      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  updateNode(params: UpdateNodeParams): RpcResult<OutlineNode> {
    try {
      let node: OutlineNode | null = null;
      if (params.content !== undefined) node = this.repo.updateContent(params.id, params.content);
      if (params.is_expanded !== undefined) node = this.repo.updateExpanded(params.id, params.is_expanded);
      if (!node) node = this.repo.getById(params.id);
      return { success: true, data: node! };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  moveNode(params: MoveNodeParams): RpcResult<OutlineNode> {
    try {
      const node = this.repo.move(params.id, params.new_parent_id, params.new_position);
      return { success: true, data: node };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  indentNode(params: IndentNodeParams): RpcResult<OutlineNode | null> {
    try {
      return { success: true, data: this.repo.indent(params.id) };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  outdentNode(params: OutdentNodeParams): RpcResult<OutlineNode | null> {
    try {
      return { success: true, data: this.repo.outdent(params.id) };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  deleteNode(params: DeleteNodeParams): RpcResult<void> {
    try {
      if (params.deleteChildren) this.repo.softDeleteSubtree(params.id);
      else this.repo.deleteAndReparent(params.id);
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  getStats(): RpcResult<{ nodeCount: number }> {
    try {
      return { success: true, data: { nodeCount: this.repo.getNodeCount() } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }
}
