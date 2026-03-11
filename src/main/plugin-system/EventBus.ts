/**
 * Typed event bus for cross-plugin communication.
 */

export type EventHandler = (...args: any[]) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, ...args: any[]): Promise<void> {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) {
      await h(...args);
    }
  }

  removeHandler(handler: EventHandler): void {
    for (const set of this.handlers.values()) {
      set.delete(handler);
    }
  }
}

export const CoreEvents = {
  NODE_CREATED: "node:created",
  NODE_UPDATED: "node:updated",
  NODE_DELETED: "node:deleted",
  NODE_MOVED: "node:moved",
  NODE_INDENTED: "node:indented",
  NODE_OUTDENTED: "node:outdented",
  TREE_LOADED: "tree:loaded",
  ZOOM_CHANGED: "zoom:changed",
  PLUGIN_LOADED: "plugin:loaded",
  PLUGIN_UNLOADED: "plugin:unloaded",
  APP_READY: "app:ready",
  APP_WILL_QUIT: "app:will-quit",
  SEARCH_OPENED: "ui:search:opened",
} as const;
