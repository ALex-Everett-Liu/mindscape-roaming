# Breadcrumb and focus mode (implementation guide)

This document describes how **breadcrumb navigation** and **focus mode** work in luhmann-roam, and how they tie into the outliner UI. Use it as a blueprint when building a similar feature elsewhere.

## What the user sees

- **Focus mode**: The user can “focus” on one node in the hierarchy. The main outliner (`#outliner-container`) is replaced with a view rooted at that node (built with the same node-rendering pipeline as the full tree).
- **Breadcrumb trail**: While focused, a bar appears **above** the outliner showing the path from the root to the focused node: home control → ancestor 1 → … → **current node** (styled as active).
- **Home**: Clicking the home control exits focus mode and restores the previously saved full-tree HTML (or triggers a full refresh if nothing was saved).
- **Jumping within the path**: Clicking a **non-final** breadcrumb focuses that ancestor so the trail and subtree view move there. The last segment is not clickable (it is the current focus).
- **Visual emphasis**: The focused node gets the `focused-node` class (background and left border).

Entry points in this project:

- Per-node **Focus** button (🎯) in `nodeActionsManager.js`, which calls `BreadcrumbManager.focusOnNode(nodeId)`.
- **Default focus on startup**: `localStorage` key `main_default_focus_node`; initial load can open directly into focus mode (see `fetchNodes` in `app.js`).

## Source files

| Piece | Location |
|--------|-----------|
| Logic and UI | `public/js/breadcrumbManager.js` |
| Styles | `public/css/features/breadcrumbs.css` (imported from `public/css/index.css`) |
| Script load order | `public/index.html` includes `js/breadcrumbManager.js` |
| Initialization | `app.js` calls `BreadcrumbManager.initialize()` during startup |
| Per-node wiring | `createNodeElement` in `app.js` calls `BreadcrumbManager.addNodeFocusHandler(nodeDiv, node.id)` |
| Focus action button | `public/js/nodeActionsManager.js` |

## Mental model: two coupled features

Breadcrumbs here are **not** a passive “you are here” strip for the normal full tree. They appear when **focus mode** is on:

1. **`focusOnNode(nodeId)`** validates the node (e.g. `GET /api/nodes/:id`), sets internal state, **updates the breadcrumb DOM**, then **rebuilds the outliner** around that node and highlights it.
2. **`clearFocus()`** clears state, hides breadcrumbs, removes `focused-node`, and **restores** the outliner’s original HTML snapshot taken before focus (see below).

So in a port, decide whether you want the same coupling or only a read-only trail; the data flow is the same either way (ancestry → render segments).

## DOM placement

On `initialize()`, the manager creates a `div.breadcrumb-container`, initially `display: none`, and inserts it **immediately before** `#outliner-container` (sibling above the outliner). If `#outliner-container` is missing, the container is still created but not attached usefully—your host page should match this structure.

## How ancestry is computed

There is **no required** `GET /api/nodes/:id/ancestry` endpoint in practice. The implementation uses **`buildNodeAncestry(nodeId)`**:

1. Start at `nodeId`.
2. `GET /api/nodes/:currentId` and read `parent_id`.
3. Prepend each node to an array and walk up until `parent_id` is falsy.

Result order: **root → … → focused node** (each item includes at least `id`, `content`, `parent_id`).

**Optimization for your own backend:** a single `GET /api/nodes/:id/ancestry` that returns the path in one round trip avoids N sequential fetches and is preferable at scale.

## Breadcrumb rendering (`updateBreadcrumbTrail`)

- If the ancestry array is empty, breadcrumbs are hidden.
- Otherwise the container is shown (`display: flex`), cleared, then built as:
  - **Home** — `div.breadcrumb-item.breadcrumb-home` with title “Return to root level”; click → `clearFocus()`.
  - For each ancestor: `>` separator (`breadcrumb-separator`) + `div.breadcrumb-item` with `dataset.id`, text from `ancestor.content`.
  - The **last** item gets `breadcrumb-active` and **no** click handler; earlier items call `navigateToNode(ancestor.id)`.

`navigateToNode` expands parents as needed (`expandParentNodes`) and then calls `focusOnNode` again—important if your tree UI requires expanded parents to show a node.

## Focus view: replacing the outliner (`filterToNodeAndDescendants`)

When focusing:

1. The outliner’s current `innerHTML` is stored **once** on the element as `outlinerContainer._originalContent` (only if not already set).
2. The container is cleared.
3. `window.createNodeElement(focusedNode)` appends a full node subtree using the same code path as the rest of the app (actions, children, etc.).

Exiting focus restores `innerHTML` from `_originalContent` and deletes that property; if it was never set, the code falls back to `window.fetchNodes()` if present.

**Porting tip:** snapshotting HTML is simple but fragile if your app relies on many live listeners or external state. Alternatives: re-fetch the full tree from the server, or keep focus as a **filter flag** in your renderer instead of swapping HTML.

## Server interactions used

| Action | Typical endpoint |
|--------|-------------------|
| Load node | `GET /api/nodes/:id` |
| Children (used in debugging / older paths; focus build uses `createNodeElement`) | `GET /api/nodes/:id/children` |
| Expand parent | `GET /api/nodes/:id`, then if `!is_expanded` → `POST /api/nodes/:id/toggle` and optional `NodeOperationsManager.refreshSubtree` |

Your API must expose a **parent pointer** (`parent_id` or equivalent) for ancestry walking.

## Styling (CSS contract)

Key classes in `breadcrumbs.css`:

- `.breadcrumb-container` — flex row, wrapping, light background.
- `.breadcrumb-item` — truncates long titles (`ellipsis`), clickable appearance.
- `.breadcrumb-active` — bold, primary color, no hover background.
- `.breadcrumb-separator` — muted `>` between items.
- `.breadcrumb-home` — home icon sizing.
- `.focused-node` — applied to `.node[data-id="…"]` for the focused row.

## Public API (`window.BreadcrumbManager`)

| Method | Role |
|--------|------|
| `initialize()` | Create container, read initial language from `I18n` or `localStorage` (language is mostly legacy here; trail text uses `content`). |
| `focusOnNode(nodeId)` | Enter focus mode or no-op / clear if invalid. |
| `clearFocus()` | Exit focus mode and restore outliner. |
| `updateLanguage(language)` | Updates tooltip and can rebuild trail if visible. |
| `addNodeFocusHandler(el, nodeId)` | Sets `mouseenter` / `mouseleave` on `window.hoveredNodeId` (reserved for future or external hotkeys). |
| `restoreFocusState()` | Re-applies focus filtering after refresh (exported; call from your refresh pipeline if needed). |
| `getCurrentFocusedNodeId()` | Returns focused id or `null`. |
| `isInFocusMode()` | Boolean. |
| `expandNodeDirectly(nodeId)` | Expand one node via API + subtree refresh helper. |

## Integration patterns elsewhere in the app

- **`preserveFocusState` in `app.js`**: Before an async operation, records whether focus mode was active; afterward can call `focusOnNode` again to re-apply the same focused subtree (uses `BreadcrumbManager` when available).
- **Default focus**: First load can set `nodes = [focusNode]`, render, then `setTimeout(() => BreadcrumbManager.focusOnNode(id), …)` so breadcrumbs and focus UI match.

## Known quirks / cleanup candidates (for accurate ports)

- **`updateBreadcrumbs` inside `breadcrumbManager.js`** references helpers like `exitFocusMode` / `getNodePath` and is **not** part of the active public API; the live path is `updateBreadcrumbTrail`. If you copy the file, treat that block as dead code unless you wire it up.
- **Alt+F**: The focus button tooltip mentions “Alt+F when hovering,” but there is no `altKey` handler in the public JS bundle; `hoveredNodeId` is set on hover for potential future use.
- **`restoreFocusState`** is exported but not wired from `fetchNodes` in the current tree—if you add full reloads during focus mode, you may need to call it explicitly.

## Porting checklist (another project)

1. **Data**: Nodes with stable ids and a parent reference (or an ancestry API).
2. **UI shell**: A mount point above the main tree for `breadcrumb-container`.
3. **Focus behavior**: Decide snapshot-restore vs re-render from state.
4. **Ancestry**: One server path or client walk; handle 404 / wrong vault gracefully.
5. **Navigation**: Clicking ancestors may require expanding parents—mirror `expandParentNodes` + toggle API or your framework’s equivalent.
6. **Styling**: Map the same class names or replace with your design tokens.
7. **Entry points**: Focus button, optional default route/localStorage, optional keyboard shortcut using `hoveredNodeId` if you implement it.

This should be enough to reproduce the behavior: **hierarchical trail + focused subtree + explicit exit**, with a clear split between **ancestry data**, **breadcrumb DOM**, and **outliner content swapping**.
