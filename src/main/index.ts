import { Electrobun, BrowserWindow, BrowserView } from "electrobun/bun";
import { getDatabase, closeDatabase } from "./database/connection";
import { runMigrations } from "./database/migrations";
import { seedInitialData } from "./database/seed";
import { OutlineService } from "./services/outlineService";
import type {
  CreateNodeParams,
  UpdateNodeParams,
  MoveNodeParams,
  IndentNodeParams,
  OutdentNodeParams,
  DeleteNodeParams,
  GetSubtreeParams,
  SearchParams,
} from "./rpc/types";

// ─── Initialize Database ──────────────────────────────
const db = getDatabase();
runMigrations(db);
seedInitialData(db);

// ─── Initialize Service Layer ─────────────────────────
const outlineService = new OutlineService(db);

// ─── Create RPC Handlers ──────────────────────────────
const outlinerRPC = BrowserView.defineRPC({
  maxRequestTime: 5000,
  handlers: {
    requests: {
      getFullTree: async () => outlineService.getFullTree(),
      getSubtree: async (params: GetSubtreeParams) =>
        outlineService.getSubtree(params),
      getNode: async (params: { id: string }) =>
        outlineService.getNode(params.id),
      getAncestors: async (params: { nodeId: string }) =>
        outlineService.getAncestors(params.nodeId),
      search: async (params: SearchParams) => outlineService.search(params),
      getStats: async () => outlineService.getStats(),
      createNode: async (params: CreateNodeParams) =>
        outlineService.createNode(params),
      updateNode: async (params: UpdateNodeParams) =>
        outlineService.updateNode(params),
      moveNode: async (params: MoveNodeParams) =>
        outlineService.moveNode(params),
      indentNode: async (params: IndentNodeParams) =>
        outlineService.indentNode(params),
      outdentNode: async (params: OutdentNodeParams) =>
        outlineService.outdentNode(params),
      deleteNode: async (params: DeleteNodeParams) =>
        outlineService.deleteNode(params),
    },
  },
});

// ─── Create Main Window ───────────────────────────────
const mainWindow = new BrowserWindow({
  title: "Outliner",
  frame: { width: 900, height: 700 },
  url: "views://renderer/index.html",
  rpc: outlinerRPC,
});

// ─── App Lifecycle ────────────────────────────────────
Electrobun.events.on("will-quit", () => {
  closeDatabase();
});

mainWindow.on("close", () => {
  Electrobun.quit();
});
