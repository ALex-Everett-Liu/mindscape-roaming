import { html } from "htm/preact";
import type { OutlineTreeNode } from "../../shared/types";
import { OutlineNode } from "./OutlineNode";
import { store } from "../state/store";

interface Props {
  nodes: OutlineTreeNode[];
  focusedNodeId: string | null;
}

export function OutlineTree({ nodes, focusedNodeId }: Props) {
  if (nodes.length === 0) {
    return html`
      <div
        class="empty-state"
        tabIndex=${0}
        onKeyDown=${(e: KeyboardEvent) => {
          if (e.key === "Enter") {
            e.preventDefault();
            store.createNode(null, store.getState().zoomedNodeId);
          }
        }}
      >
        <p>No items yet. Press <kbd>Enter</kbd> or click "+ New Item" to create one.</p>
      </div>
    `;
  }

  return html`
    <ul class="outline-tree" role="tree">
      ${nodes.map(
        (node) =>
          html`
            <${OutlineNode}
              key=${node.id}
              node=${node}
              focusedNodeId=${focusedNodeId}
            />
          `
      )}
    </ul>
  `;
}
