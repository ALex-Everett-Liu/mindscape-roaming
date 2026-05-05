# Vim Navigation Plugin — Roadmap

Future plans for `third-party-vim-nav`.

## Current Status (v1.0.0)

- **Edit Mode** (Alt+V): Hint labels on breadcrumbs, ancestor panels, and outline nodes — typing a hint jumps and starts editing
- **Focus Mode** (Alt+Shift+V): Same hint system, but only highlights/focuses the target node without entering edit mode
- **Three target types**: Breadcrumbs (cyan hints), ancestor panels (green hints), and outline nodes (yellow hints)
- Status bar with mode indicator, buffer display, matching count, and Enter-to-confirm prompt
- Home-row hint keys: `a`, `s`, `d`, `f`, `g`, `h`, `j`, `k`, `l`, `;`

## Normal Mode (planned)

- `j` / `k` — move focus down / up one node (Vim-style vertical navigation)
- `h` / `l` — collapse / expand the focused node
- `Enter` — zoom into the focused node (same as bullet click)
- `Shift+Enter` — zoom out (go up one level)
- `o` / `O` — create a new node below / above the focused node
- `dd` — delete the focused node
- `>>` / `<<` — indent / outdent the focused node
- Esc in Normal mode exits to Insert mode (or back to nav mode if no Insert mode)

## Insert Mode (planned)

- Same as current outliner editing — type text into the focused node's editor
- `Esc` exits to Normal mode

## Visual Mode (planned)

- `v` — start selecting nodes; `j`/`k` extend selection
- `d` / `y` — delete / yank (copy) selected nodes
- `p` — paste below

## Motions & Text Objects (planned)

- `w` / `b` — word forward / backward in the editor
- `0` / `$` — start / end of line
- `gg` / `G` — first / last node in tree
- `/` — search within tree (fuzzy filter)

## Other Vim Features (planned)

- `.` — repeat last command
- `u` / `Ctrl+R` — undo / redo
- Folding: `z` commands (`zc`, `zo`, `za`, `zM`, `zR`)
