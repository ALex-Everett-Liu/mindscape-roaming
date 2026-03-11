/**
 * Simple event bus for renderer plugin communication.
 */
type EventHandler = (...args: unknown[]) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  async emit(event: string, ...args: unknown[]): Promise<void> {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) {
      await h(...args);
    }
  }
}
