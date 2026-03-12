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
      reportUnsavedState: {
        params: { hasUnsaved: boolean };
        response: Promise<void>;
      };
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
      listPlugins: {
        params: Record<string, never>;
        response: RpcResult<import("./types").PluginInfo[]>;
      };
      enablePlugin: {
        params: { pluginId: string };
        response: RpcResult<boolean>;
      };
      disablePlugin: {
        params: { pluginId: string };
        response: RpcResult<boolean>;
      };
      importPluginStates: {
        params: { states: Record<string, boolean> };
        response: RpcResult<void>;
      };
      commitSave: {
        params: Record<string, never>;
        response: RpcResult<{ success: boolean }>;
      };
      restoreFromBackup: {
        params: Record<string, never>;
        response: RpcResult<{ success: boolean; error?: string }>;
      };
      hasBackup: {
        params: Record<string, never>;
        response: RpcResult<boolean>;
      };
    };
    messages: Record<string, unknown>;
  };
  webview: {
    requests: Record<string, never>;
    messages: Record<string, unknown>;
  };
};
