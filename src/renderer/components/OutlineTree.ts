import { html } from "htm/preact";
import type { OutlineTreeNode } from "../../shared/types";
import { OutlineNode } from "./OutlineNode";

interface Props {
  nodes: OutlineTreeNode[];
  focusedNodeId: string | null;
}

export function OutlineTree({ nodes, focusedNodeId }: Props) {
  if (nodes.length === 0) {
    return html`
      <div class="empty-state">
        <p>No items yet. Press <kbd>Enter</kbd> to create one.</p>
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
