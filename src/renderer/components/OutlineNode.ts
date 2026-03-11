import { useCallback } from "preact/hooks";
import { html } from "htm/preact";
import type { OutlineTreeNode } from "../../shared/types";
import { store } from "../state/store";
import { NodeEditor } from "./NodeEditor";
import { OutlineTree } from "./OutlineTree";

interface Props {
  node: OutlineTreeNode;
  focusedNodeId: string | null;
}

export function OutlineNode({ node, focusedNodeId }: Props) {
  const isFocused = focusedNodeId === node.id;
  const hasChildren = node.children.length > 0;

  // Keyboard handling is done by core-keyboard plugin (document-level keydown)

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

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer!.setData("text/plain", node.id);
      e.dataTransfer!.effectAllowed = "move";
    },
    [node.id]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const draggedId = e.dataTransfer!.getData("text/plain");
      if (draggedId && draggedId !== node.id) {
        store.moveNode(draggedId, node.id, 0);
      }
    },
    [node.id]
  );

  const isUnsaved = store.isNodeUnsaved(node.id);

  return html`
    <li
      class="outline-node ${isFocused ? "focused" : ""} ${isUnsaved ? "unsaved" : ""}"
      role="treeitem"
      aria-expanded=${hasChildren ? node.is_expanded : undefined}
      draggable=${true}
      onDragStart=${handleDragStart}
      onDragOver=${handleDragOver}
      onDrop=${handleDrop}
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
