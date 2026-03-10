import { html } from "htm/preact";
import type { OutlineNode } from "../../shared/types";

interface Props {
  ancestors: OutlineNode[];
  onNavigate: (id: string | null) => void;
}

export function Breadcrumb({ ancestors, onNavigate }: Props) {
  return html`
    <nav class="breadcrumb" aria-label="Navigation">
      <button class="breadcrumb-item root" onClick=${() => onNavigate(null)}>
        Home
      </button>
      ${ancestors.map(
        (node, i) =>
          html`
            <span class="breadcrumb-separator">›</span>
            <button
              class="breadcrumb-item ${i === ancestors.length - 1 ? "current" : ""}"
              onClick=${() => onNavigate(node.id)}
            >
              ${node.content || "(empty)"}
            </button>
          `
      )}
    </nav>
  `;
}
