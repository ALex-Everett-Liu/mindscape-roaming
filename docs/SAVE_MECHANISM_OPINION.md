# Save Mechanism: Opinion & Comparison

This document compares Mindscape-Roaming's data-saving implementation with the analysis and design guide from another project (Luhmann-Roam). The reference doc emphasizes **manual save with explicit Save/Discard**, change tracking, and user control.

---

## 1. Summary: Is the Reference Implementation Better?

**Yes.** The reference implementation is stronger for user control, data safety, and consistency. Our project uses **auto-save only** with immediate persistence on every change. The reference offers **manual save** (with optional auto-save) and proper change-tracking semantics.

Below is a detailed comparison and recommendations.

---

## 2. Current Implementation Compared

### 2.1 Mindscape-Roaming: How We Save

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | Content: `onInput` → 300ms debounce → `store.updateContent()` → `api.updateNode()`. Other ops: immediate API call. |
| **Change detection** | None — we persist immediately |
| **Storage** | No `unsavedChanges` — SQLite via RPC |
| **Mode** | **Auto-save only** — no manual option |
| **Discard** | Not implemented — user cannot revert edits before save |
| **Visual feedback** | None — no `.unsaved` indicator, no Save/Discard buttons |
| **Error handling** | `updateContent` does not catch `api.updateNode` failures; UI updates locally regardless |

**Flow:**
```
User types → debounce 300ms → api.updateNode() → updateNodeInTree()
User expands/collapses → api.updateNode() immediately
User indents/outdents/moves/deletes → api.*() immediately → loadTree()
```

### 2.2 Reference (Luhmann-Roam): Key Strengths

| Aspect | Reference |
|--------|-----------|
| **Dual mode** | Auto-save OR manual save (user preference) |
| **Change tracking** | `unsavedChanges` Map: `nodeId → { content, originalContent }` |
| **Discard** | Restores `originalContent` to DOM and state; clears `unsavedChanges` |
| **Graph plugin** | Typed changes: `create`, `update`, `delete` for correct discard semantics |
| **Visual feedback** | `.unsaved` class, "Save Changes (N)" count, disabled during save |
| **Navigation warning** | `beforeunload` when unsaved (recommended) |

---

## 3. Where Our Implementation Falls Short

### 3.1 No User Control Over When to Persist

- Every edit (after debounce) is written to the database immediately.
- User cannot make several edits and then decide to discard them.
- No "undo before commit" — once the API returns, it's done.

### 3.2 No Discard / Revert

- Typo corrections or experimental edits are persisted as soon as the user blurs or stops typing.
- No "Revert to original" for a node or a batch of nodes.

### 3.3 Silent Failures

From `store.ts`:

```typescript
async updateContent(id: string, content: string): Promise<void> {
  await api.updateNode({ id, content });
  this.updateNodeInTree(id, { content });
}
```

- If `api.updateNode` fails, the error is unhandled.
- `updateNodeInTree` still runs, so the UI shows the new content but it may not be persisted.
- User has no indication that the save failed.

### 3.4 No Close / Quit Warning

- Closing the window does not check for in-flight or pending saves.
- Electrobun `will-quit` runs plugin shutdown and DB close, but there is no check for "unsaved" or "saving" state in the renderer.
- For auto-save, this is less critical than for manual save, but if an RPC is in flight when the app quits, data could be lost.

### 3.5 Structural Operations Are Immediate

- Indent, outdent, move, delete: each calls the API and then `loadTree()`.
- No batching; no ability to "try" a restructuring and then discard.
- This may be acceptable for structural ops, but it contrasts with the reference's more deliberate approach.

---

## 4. Where Our Implementation Is Acceptable

### 4.1 Simplicity

- No Save/Discard UI, no unsaved state, no change tracking.
- Easier to reason about and maintain.
- Some users prefer "everything saves automatically."

### 4.2 Desktop Context

- Not a browser tab — less risk of accidental close.
- Local SQLite — no network dependency for persistence (unlike a remote API).
- Debounce reduces write frequency during typing.

### 4.3 Content-Only Debounce

- 300ms debounce avoids a write on every keystroke.
- Reduces DB churn and RPC traffic.

---

## 5. Verdict

| Criterion | Reference | Our Project |
|-----------|-----------|-------------|
| User control (Save/Discard) | ✅ Strong | ❌ None |
| Change tracking | ✅ Yes | ❌ No |
| Discard / revert | ✅ Yes | ❌ No |
| Visual feedback | ✅ Yes | ❌ No |
| Error handling | ✅ Explicit | ❌ Silent |
| Navigation/close warning | ✅ Recommended | ❌ Not implemented |
| Simplicity | ⚠️ More complex | ✅ Simpler |
| Auto-save option | ✅ Opt-in | ✅ Default (only) |

The reference is better for **data safety** and **user agency**. Our project prioritizes simplicity and real-time feel but sacrifices control and robustness.

---

## 6. Recommendations

### 6.1 High Priority: Error Handling

Add error handling and user feedback for failed saves:

```typescript
async updateContent(id: string, content: string): Promise<void> {
  const result = await api.updateNode({ id, content });
  if (!result.success) {
    // Show toast/alert: "Failed to save. Retry?"
    // Optionally: keep in "dirty" state for retry
    return;
  }
  this.updateNodeInTree(id, { content });
}
```

### 6.2 Medium Priority: Optional Manual Save

Introduce a settings toggle (e.g. `manualSaveEnabled` in localStorage or DB):

- **Manual mode**: Store changes in an `unsavedChanges` Map; show Save/Discard in toolbar; persist only on Save.
- **Auto mode** (current): Keep current behavior as default for users who prefer it.

### 6.3 Medium Priority: Close Warning (When Manual Save Exists)

If manual save is added, wire a close warning:

```typescript
Electrobun.events.on("will-quit", async (e) => {
  const hasUnsaved = await checkUnsavedFromRenderer(); // via RPC or shared state
  if (hasUnsaved) {
    e.preventDefault();
    // Show "You have unsaved changes. Save before quitting?"
  }
});
```

### 6.4 Lower Priority: Unified Save State (Future)

If we add multiple save sources (e.g. main tree + future plugins), consider a shared module like the reference’s `saveStateManager`:

- Register sources with `getChanges`, `save`, `discard`
- Aggregate `hasUnsavedChanges` and coordinate Save All / Discard All

---

## 7. Conclusion

The reference implementation is stronger overall: it gives users explicit control over when to persist, supports discard, and handles errors and navigation more carefully. Our project is simpler but weaker on user control and robustness.

**Minimal improvements:** Add error handling and user feedback for failed saves. ✅ Implemented.

**Broader improvement:** Add an optional manual-save mode with change tracking, Save/Discard UI, and close warning, using the reference design as a guide. ✅ Implemented (manual save is now the only mode; no auto-save).
