import { useRef, useEffect, useCallback } from "preact/hooks";
import { html } from "htm/preact";

interface Props {
  nodeId: string;
  content: string;
  isFocused: boolean;
  onKeyDown: (e: KeyboardEvent) => void;
  onChange: (content: string) => void;
  onFocus: () => void;
}

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function NodeEditor({
  nodeId,
  content,
  isFocused,
  onKeyDown,
  onChange,
  onFocus,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  const debouncedSave = useCallback(
    debounce((text: string) => onChange(text), 300),
    [onChange]
  );

  useEffect(() => {
    if (isFocused && editorRef.current) {
      editorRef.current.focus();

      const range = document.createRange();
      const sel = window.getSelection();
      if (sel && editorRef.current) {
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [isFocused]);

  const handleInput = useCallback(
    (e: Event) => {
      const text = (e.target as HTMLDivElement).textContent || "";
      debouncedSave(text);
    },
    [debouncedSave]
  );

  return html`
    <div
      ref=${editorRef}
      class="node-editor"
      contenteditable="true"
      spellcheck="true"
      data-node-id=${nodeId}
      data-placeholder="Type something..."
      onInput=${handleInput}
      onKeyDown=${onKeyDown}
      onFocus=${onFocus}
    >
      ${content}
    </div>
  `;
}
