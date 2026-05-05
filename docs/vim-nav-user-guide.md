# Vim Navigation Plugin — User Guide

The **Vim Navigation** plugin (`third-party-vim-nav`) lets you navigate and edit the entire outliner without ever touching the mouse. It assigns keyboard hint labels to every visible element, so you can jump directly to any node, breadcrumb, or ancestor panel by typing a short letter combo.

## Enabling the Plugin

1. Open **Settings** via the gear icon in the toolbar, or `Ctrl+P` → "Open Settings."
2. Go to the **Plugins** tab.
3. Find **Vim Navigation** and toggle it **ON**.
4. Close Settings. The shortcut `Alt+V` is now active.

## Two Modes

| Mode | Shortcut | What happens after you type a hint |
|------|----------|------------------------------------|
| **Edit** | `Alt+V` | Jumps to the node and opens the editor — start typing immediately |
| **Focus** | `Alt+Shift+V` | Zooms into the node — shows its children as the new view (same as clicking the bullet `•`) |

Both modes work identically for breadcrumbs and ancestor panels — they always zoom in.

## How It Works

1. Press **`Alt+V`** (Edit) or **`Alt+Shift+V`** (Focus).
2. Every visible element gets a colored hint label:
   - **Yellow** — outline nodes
   - **Cyan** — breadcrumb items
   - **Green** — ancestor panels ("Ancestors above this page")
3. A **status bar** appears at the bottom showing the current mode (`Edit` or `Focus`), the hint buffer, and the total hint count.
4. **Type the hint label** you see on your target element.
5. As you type:
   - Non-matching hints **dim out** so you can see which ones are still valid.
   - If you type a prefix that matches only one hint with no longer conflicts, you jump immediately.
   - If your typed string exactly matches a hint but longer hints share the same prefix, the matching hint gets a **green highlight** and the status bar shows `[Enter to jump to node]` — press `Enter` to confirm, or keep typing to narrow further.
6. On match, the plugin exits nav mode and performs the action (zoom or edit).

## Keyboard Controls in Nav Mode

| Key | Action |
|-----|--------|
| `a s d f g h j k l ;` | Add character to hint buffer |
| `Backspace` | Remove last character from buffer |
| `Enter` | Confirm the current exact match (when prefix is ambiguous) |
| `Escape` | Exit nav mode without jumping |
| `Alt+V` / `Alt+Shift+V` | Exit nav mode |

## Hint Labels

- **10 nodes or fewer**: single-character hints (`a`, `s`, `d`, `f`, `g`, `h`, `j`, `k`, `l`, `;`)
- **More than 10 nodes**: multi-character hints (`aa`, `as`, `ad`, …)
- Hints are assigned top-to-bottom in breadcrumb → panel → node order

## Target Types & Colors

| Target | Color | Action on jump |
|--------|-------|---------------|
| Outline node | Yellow | Edit mode: focus + edit / Focus mode: zoom in |
| Breadcrumb item | Cyan | Zoom to that ancestor |
| Breadcrumb Home | Cyan | Return to root view |
| Ancestor panel item | Green | Zoom to that ancestor |
| Ancestor panel "Exit page" | Green | Return to root view |

## Tips

- Use **Edit mode** (`Alt+V`) when you want to quickly jump to a node and start editing.
- Use **Focus mode** (`Alt+Shift+V`) when you want to drill down into a section — it's like clicking the bullet `•` from the keyboard.
- When zoomed into a node, the breadcrumbs above the tree also get hint labels — you can jump back up the hierarchy without touching the mouse.
- If you lose track of what you typed, look at the status bar at the bottom — it shows your current buffer and how many hints still match.
