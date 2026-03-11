import type { PluginManifest } from "../../shared/plugin-types";
import type { EventBus } from "./EventBus";
import type { CommandRegistry } from "./CommandRegistry";

export interface RendererPluginContextDeps {
  manifest: PluginManifest;
  eventBus: EventBus;
  commands: CommandRegistry;
}

export class RendererPluginContext {
  readonly pluginId: string;

  constructor(
    manifest: PluginManifest,
    private eventBus: EventBus,
    private commands: CommandRegistry
  ) {
    this.pluginId = manifest.id;
  }

  on(event: string, handler: (...args: unknown[]) => void): () => void {
    return this.eventBus.on(event, handler);
  }

  async emit(event: string, ...args: unknown[]): Promise<void> {
    return this.eventBus.emit(event, ...args);
  }

  registerCommand(command: {
    id: string;
    name: string;
    shortcut?: string;
    execute: () => void | Promise<void>;
  }): void {
    this.commands.register({
      ...command,
      id: `${this.pluginId}:${command.id}`,
    });
  }
}
