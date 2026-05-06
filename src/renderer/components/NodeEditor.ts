import { useRef, useEffect, useCallback } from "preact/hooks";
import { html } from "htm/preact";
import { debounce } from "../utils/debounce";

interface Props {
  nodeId: string;
  content: string;
  isFocused: boolean;
  onChange: (content: string) => void;
  onFocus: () => void;
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

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const debouncedSave = useRef(
    debounce((text: string) => onChangeRef.current(text), 500),
  ).current;

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
