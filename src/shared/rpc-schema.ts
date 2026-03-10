/**
 * Electrobun RPC schema for Outliner
 * Defines the typed interface between main (bun) and renderer (webview)
 */
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
  SearchParams,
  RpcResult,
} from "./types";

export type OutlinerRPCType = {
  bun: {
    requests: {
      getFullTree: { params: Record<string, never>; response: RpcResult<OutlineTreeNode[]> };
      getSubtree: {
        params: GetSubtreeParams;
        response: RpcResult<OutlineTreeNode[]>;
      };
      getNode: { params: { id: string }; response: RpcResult<OutlineNode> };
      getAncestors: {
        params: { nodeId: string };
        response: RpcResult<OutlineNode[]>;
      };
      search: {
        params: SearchParams;
        response: RpcResult<OutlineNode[]>;
      };
      getStats: {
        params: Record<string, never>;
        response: RpcResult<{ nodeCount: number }>;
      };
      createNode: {
        params: CreateNodeParams;
        response: RpcResult<OutlineNode>;
      };
      updateNode: {
        params: UpdateNodeParams;
        response: RpcResult<OutlineNode>;
      };
      moveNode: {
        params: MoveNodeParams;
        response: RpcResult<OutlineNode>;
      };
      indentNode: {
        params: IndentNodeParams;
        response: RpcResult<OutlineNode | null>;
      };
      outdentNode: {
        params: OutdentNodeParams;
        response: RpcResult<OutlineNode | null>;
      };
      deleteNode: {
        params: DeleteNodeParams;
        response: RpcResult<void>;
      };
    };
  };
  webview: {
    requests: Record<string, never>;
  };
};
