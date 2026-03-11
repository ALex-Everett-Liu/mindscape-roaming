/**
 * Flag set by core-drag-drop plugin when loaded.
 * OutlineNode uses this to enable draggable; when false, no native drag is possible.
 */
export let dragDropEnabled = false;

const EVENT = "drag-drop-plugin-state-changed";

export function setDragDropEnabled(enabled: boolean): void {
  if (dragDropEnabled === enabled) return;
  dragDropEnabled = enabled;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Subscribe to drag-drop enabled state changes (e.g. when plugin is toggled in settings). */
export function onDragDropStateChange(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}
