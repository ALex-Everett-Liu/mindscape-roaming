/**
 * Shared flag so CommandRegistry can suppress global shortcuts while the
 * command palette is open (except Ctrl/Cmd+P to toggle).
 */
let open = false;

export function setCommandPaletteOpen(value: boolean): void {
  open = value;
}

export function isCommandPaletteOpen(): boolean {
  return open;
}
