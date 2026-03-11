/**
 * Registers global keyboard shortcuts and executes commands.
 */
export interface Command {
  id: string;
  name: string;
  shortcut?: string;
  execute: () => void | Promise<void>;
}

type Unsubscribe = () => void;

export class CommandRegistry {
  private commands = new Map<string, Command>();
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private unsubscribes: Unsubscribe[] = [];

  register(command: Command): void {
    this.commands.set(command.id, command);
    this.updateListener();
  }

  unregister(id: string): void {
    this.commands.delete(id);
    this.updateListener();
  }

  unregisterAll(pluginId: string): void {
    for (const [id, cmd] of this.commands) {
      if (id.startsWith(pluginId + ":")) this.commands.delete(id);
    }
    this.updateListener();
  }

  private updateListener(): void {
    this.removeListener();
    if (this.commands.size === 0) return;
    this.keydownHandler = (e: KeyboardEvent) => {
      const shortcut = this.eventToShortcut(e);
      if (!shortcut) return;
      for (const cmd of this.commands.values()) {
        if (cmd.shortcut && this.shortcutMatches(cmd.shortcut, shortcut)) {
          e.preventDefault();
          void cmd.execute();
          return;
        }
      }
    };
    document.addEventListener("keydown", this.keydownHandler, true);
  }

  private removeListener(): void {
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }

  private eventToShortcut(e: KeyboardEvent): string | null {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    const key =
      e.key === "Enter"
        ? "Enter"
        : e.key.length === 1
          ? e.key.toUpperCase()
          : null;
    if (!key) return null;
    parts.push(key);
    return parts.join("+");
  }

  private shortcutMatches(shortcut: string, pressed: string): boolean {
    const n = (s: string) => s.replace(/Meta/g, "Ctrl").toUpperCase();
    return n(shortcut) === n(pressed);
  }

  destroy(): void {
    this.removeListener();
    this.commands.clear();
    for (const unsub of this.unsubscribes) unsub();
  }
}
