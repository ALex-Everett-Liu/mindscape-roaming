import type {
  OutlineNode,
  OutlineTreeNode,
  SearchResultItem,
  CreateNodeParams,
  UpdateNodeParams,
  MoveNodeParams,
  IndentNodeParams,
  OutdentNodeParams,
  DeleteNodeParams,
  GetSubtreeParams,
  SearchParams,
  RpcResult,
  PluginInfo,
  LinkRecord,
  LinkWithNode,
  CreateLinkParams,
  UpdateLinkParams,
  GetNodeLinksParams,
} from "../../shared/types";

type OutlinerRpcRequest = {
  reportUnsavedState?: (params: { hasUnsaved: boolean }) => Promise<void>;
  getFullTree: (params?: Record<string, never>) => Promise<RpcResult<OutlineTreeNode[]>>;
  getSubtree: (params: GetSubtreeParams) => Promise<RpcResult<OutlineTreeNode[]>>;
  getNode: (params: { id: string }) => Promise<RpcResult<OutlineNode>>;
  getAncestors: (params: { nodeId: string }) => Promise<RpcResult<OutlineNode[]>>;
  search: (params: SearchParams) => Promise<RpcResult<SearchResultItem[]>>;
  resolveBlockRef: (params: { id: string }) => Promise<RpcResult<OutlineNode>>;
  getBlockBacklinks: (params: { id: string }) => Promise<RpcResult<OutlineNode[]>>;
  getBacklinkCounts: (params?: Record<string, never>) => Promise<RpcResult<Record<string, number>>>;
  getStats: (params?: Record<string, never>) => Promise<RpcResult<{ nodeCount: number }>>;
  createNode: (params: CreateNodeParams) => Promise<RpcResult<OutlineNode>>;
  updateNode: (params: UpdateNodeParams) => Promise<RpcResult<OutlineNode>>;
  moveNode: (params: MoveNodeParams) => Promise<RpcResult<OutlineNode>>;
  indentNode: (params: IndentNodeParams) => Promise<RpcResult<OutlineNode | null>>;
  outdentNode: (params: OutdentNodeParams) => Promise<RpcResult<OutlineNode | null>>;
  deleteNode: (params: DeleteNodeParams) => Promise<RpcResult<void>>;
  listPlugins: (params?: Record<string, never>) => Promise<RpcResult<PluginInfo[]>>;
  enablePlugin: (params: { pluginId: string }) => Promise<RpcResult<boolean>>;
  disablePlugin: (params: { pluginId: string }) => Promise<RpcResult<boolean>>;
  importPluginStates: (params: { states: Record<string, boolean> }) => Promise<RpcResult<void>>;
  commitSave: (params?: Record<string, never>) => Promise<RpcResult<{ success: boolean }>>;
  restoreFromBackup: (params?: Record<string, never>) => Promise<RpcResult<{ success: boolean; error?: string }>>;
  hasBackup: (params?: Record<string, never>) => Promise<RpcResult<boolean>>;
  createLink: (params: CreateLinkParams) => Promise<RpcResult<LinkRecord>>;
  getNodeLinks: (params: GetNodeLinksParams) => Promise<RpcResult<LinkWithNode[]>>;
  getLinkCounts: (params?: Record<string, never>) => Promise<RpcResult<Record<string, { total: number; outgoing: number; incoming: number }>>>;
  deleteLink: (params: { id: string }) => Promise<RpcResult<void>>;
  updateLink: (params: UpdateLinkParams) => Promise<RpcResult<LinkRecord>>;
};

let rpcRequest: OutlinerRpcRequest | null = null;

export function initApi(request: OutlinerRpcRequest): void {
  rpcRequest = request;
}

function getRpc(): OutlinerRpcRequest {
  if (!rpcRequest) {
    throw new Error("API not initialized. Call initApi() before using the api.");
  }
  return rpcRequest;
}

export const api = {
  reportUnsavedState: (hasUnsaved: boolean) =>
    getRpc().reportUnsavedState?.({ hasUnsaved }) ?? Promise.resolve(),
  getFullTree: () => getRpc().getFullTree({}),
  getSubtree: (params: GetSubtreeParams) => getRpc().getSubtree(params),
  getNode: (id: string) => getRpc().getNode({ id }),
  getAncestors: (nodeId: string) => getRpc().getAncestors({ nodeId }),
  search: (params: SearchParams) => getRpc().search(params),
  resolveBlockRef: (id: string) => getRpc().resolveBlockRef({ id }),
  getBlockBacklinks: (id: string) => getRpc().getBlockBacklinks({ id }),
  getBacklinkCounts: () => getRpc().getBacklinkCounts({}),
  getStats: () => getRpc().getStats({}),
  createNode: (params: CreateNodeParams) => getRpc().createNode(params),
  updateNode: (params: UpdateNodeParams) => getRpc().updateNode(params),
  moveNode: (params: MoveNodeParams) => getRpc().moveNode(params),
  indentNode: (params: IndentNodeParams) => getRpc().indentNode(params),
  outdentNode: (params: OutdentNodeParams) => getRpc().outdentNode(params),
  deleteNode: (params: DeleteNodeParams) => getRpc().deleteNode(params),
  listPlugins: () => getRpc().listPlugins({}),
  enablePlugin: (pluginId: string) => getRpc().enablePlugin({ pluginId }),
  disablePlugin: (pluginId: string) => getRpc().disablePlugin({ pluginId }),
  importPluginStates: (states: Record<string, boolean>) => getRpc().importPluginStates({ states }),
  commitSave: () => getRpc().commitSave({}),
  restoreFromBackup: () => getRpc().restoreFromBackup({}),
  hasBackup: () => getRpc().hasBackup({}),
  createLink: (params: CreateLinkParams) => getRpc().createLink(params),
  getNodeLinks: (params: GetNodeLinksParams) => getRpc().getNodeLinks(params),
  getLinkCounts: () => getRpc().getLinkCounts({}),
  deleteLink: (id: string) => getRpc().deleteLink({ id }),
  updateLink: (params: UpdateLinkParams) => getRpc().updateLink(params),
};
