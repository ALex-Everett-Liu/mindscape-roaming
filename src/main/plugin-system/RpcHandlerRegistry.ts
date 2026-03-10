/**
 * Registry for RPC handlers registered by plugins.
 */

export class RpcHandlerRegistry {
  private handlers = new Map<string, { handler: (params: any) => any; pluginId: string }>();

  register(name: string, handler: (params: any) => any, pluginId: string): void {
    this.handlers.set(name, { handler, pluginId });
  }

  get(name: string): ((params: any) => any) | undefined {
    return this.handlers.get(name)?.handler;
  }

  removeByPlugin(pluginId: string): void {
    for (const [name, entry] of this.handlers) {
      if (entry.pluginId === pluginId) this.handlers.delete(name);
    }
  }

  /** Build the handlers object for BrowserView.defineRPC */
  buildHandlersObject(): Record<string, (params: any) => any> {
    const obj: Record<string, (params: any) => any> = {};
    for (const [name, { handler }] of this.handlers) {
      obj[name] = handler;
    }
    return obj;
  }
}
