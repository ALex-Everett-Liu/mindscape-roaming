/**
 * Shared types for Outliner RPC (main ↔ renderer)
 * Electrobun RPC schema and data types
 */

// ─── Database Model ───────────────────────────────────
export interface OutlineNode {
  id: string;
  content: string;
  parent_id: string | null;
  position: number;
  is_expanded: boolean;
  is_page: boolean;
  created_at: number;
  updated_at: number;
}

// ─── Tree representation for the UI ──────────────────
export interface OutlineTreeNode extends OutlineNode {
  children: OutlineTreeNode[];
  depth: number;
}

export interface SearchResultItem extends OutlineNode {
  breadcrumb: string[];
}

// ─── RPC Request/Response Types ──────────────────────

export interface CreateNodeParams {
  content: string;
  parent_id: string | null;
  position?: number;
  insertAfterId?: string;
}

export interface UpdateNodeParams {
  id: string;
  content?: string;
  is_expanded?: boolean;
  is_page?: boolean;
}

export interface MoveNodeParams {
  id: string;
  new_parent_id: string | null;
  new_position: number;
}

export interface IndentNodeParams {
  id: string;
}

export interface OutdentNodeParams {
  id: string;
}

export interface DeleteNodeParams {
  id: string;
  deleteChildren: boolean;
}

export interface GetSubtreeParams {
  parent_id: string | null;
  depth?: number;
}

export interface SearchParams {
  query: string;
  limit?: number;
}

// ─── RPC Response Wrappers ───────────────────────────
export interface RpcResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Settings Export/Import ──────────────────────────
export interface SettingsExport {
  version: number;
  exportedAt: string;
  theme: string;
  /** Full CSS `font-family` when the user overrides theme typography; omit for theme default */
  uiFont?: string | null;
  plugins: Record<string, boolean>;
}

// ─── Plugin (for Settings UI) ────────────────────────
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: "core" | "community";
  essential?: boolean;
  enabled: boolean;
  loaded: boolean;
}
