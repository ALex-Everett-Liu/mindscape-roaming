import { useCallback } from "preact/hooks";
import { html } from "htm/preact";
import type { OutlineTreeNode } from "../../shared/types";
import { store } from "../state/store";
import { NodeEditor } from "./NodeEditor";
import { OutlineTree } from "./OutlineTree";
import { dragDropEnabled } from "../plugin-system/dragDropPluginState";

interface Props {
  node: OutlineTreeNode;
  focusedNodeId: string | null;
}

export function OutlineNode({ node, focusedNodeId }: Props) {
  const isFocused = focusedNodeId === node.id;
  const hasChildren = node.children.length > 0;

  // Keyboard handling is done by core-keyboard plugin (document-level keydown)
  // Drag-and-drop is done by core-drag-drop plugin (event delegation on tree)

  const handleBulletClick = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        store.zoomIn(node.id);
      }
    },
    [node.id, hasChildren]
  );

  const handleToggle = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      store.toggleExpanded(node.id);
    },
    [node.id]
  );

  const isUnsaved = store.isNodeUnsaved(node.id);

  return html`
    <li
      class="outline-node ${isFocused ? "focused" : ""} ${isUnsaved ? "unsaved" : ""} ${dragDropEnabled ? "draggable-node" : ""}"
      data-node-id=${node.id}
      role="treeitem"
      aria-expanded=${hasChildren ? node.is_expanded : undefined}
      draggable=${dragDropEnabled}
    >
      <div class="node-row">
        ${hasChildren
          ? html`
              <button
                class="toggle-btn ${node.is_expanded ? "expanded" : "collapsed"}"
                onClick=${handleToggle}
                aria-label=${node.is_expanded ? "Collapse" : "Expand"}
              >
                ▶
              </button>
            `
          : html`<span class="toggle-spacer" />`}

        <button
          class="bullet ${hasChildren ? "has-children" : ""}"
          onClick=${handleBulletClick}
          aria-label="Zoom into node"
        >
          •
        </button>

        <${NodeEditor}
          nodeId=${node.id}
          content=${node.content}
          isFocused=${isFocused}
          onChange=${(content: string) => store.updateContent(node.id, content)}
          onFocus=${() => store.setFocusedNode(node.id)}
        />
      </div>

      ${hasChildren &&
      node.is_expanded &&
      html`
        <${OutlineTree}
          nodes=${node.children}
          focusedNodeId=${focusedNodeId}
        />
      `}
    </li>
  `;
}
