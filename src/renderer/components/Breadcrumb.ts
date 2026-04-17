import { html } from "htm/preact";
import type { OutlineNode } from "../../shared/types";

interface Props {
  ancestors: OutlineNode[];
  onHome: () => void;
  onNavigateToAncestor: (id: string) => void;
}

export function Breadcrumb({ ancestors, onHome, onNavigateToAncestor }: Props) {
  const lastIndex = ancestors.length - 1;

  return html`
    <nav class="breadcrumb breadcrumb-container" aria-label="Navigation">
      <button
        type="button"
        class="breadcrumb-item breadcrumb-home"
        title="Return to root level"
        onClick=${onHome}
      >
        Home
      </button>
      ${ancestors.map((node, i) => {
        const isCurrent = i === lastIndex;
        const label = node.content || "(empty)";
        return html`
          <span class="breadcrumb-separator" aria-hidden="true">></span>
          ${isCurrent
            ? html`
                <span class="breadcrumb-item breadcrumb-active" aria-current="page">${label}</span>
              `
            : html`
                <button
                  type="button"
                  class="breadcrumb-item"
                  title=${`Focus on: ${label}`}
                  onClick=${() => onNavigateToAncestor(node.id)}
                >
                  ${label}
                </button>
              `}
        `;
      })}
    </nav>
  `;
}
