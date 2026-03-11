import { useRef, useEffect, useCallback } from "preact/hooks";
import { html } from "htm/preact";

interface Props {
  nodeId: string;
  content: string;
  isFocused: boolean;
  onChange: (content: string) => void;
  onFocus: () => void;
}

function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  ms: number
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function NodeEditor({
  nodeId,
  content,
  isFocused,
  onChange,
  onFocus,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastNodeIdRef = useRef<string>(nodeId);
  const hasInitializedRef = useRef(false);

  const debouncedSave = useCallback(
    debounce((text: string) => onChange(text), 300),
    [onChange]
  );

  // Sync from props only when switching nodes or when blurred — never while focused/typing.
  // Letting Preact patch ${content} into contenteditable on every re-render duplicates text.
  useEffect(() => {
    if (!editorRef.current) return;
    if (lastNodeIdRef.current !== nodeId) {
      lastNodeIdRef.current = nodeId;
      hasInitializedRef.current = false;
    }
    if (!hasInitializedRef.current) {
      editorRef.current.textContent = content;
      hasInitializedRef.current = true;
    } else if (!isFocused && editorRef.current.textContent !== content) {
      editorRef.current.textContent = content;
    }
  }, [nodeId, content, isFocused]);

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
      onFocus=${onFocus}
    />
  `;
}
