# Save Mechanism Analysis & Design Guide

This document analyzes the current implementation of Save/Discard changes in the Luhmann-Roam project, suggests improvements, and provides guidance for implementing similar manual-save patterns in other projects.

---

## 1. Current Implementation Overview

### 1.1 Main Application (Outliner) — `public/js/app.js`

**Location:** Sidebar buttons `#save-changes` and `#discard-changes` in `public/index.html`

**Behavior:**

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | User edits node content in-place (contenteditable) |
| **Change detection** | On `blur` event: compare `innerText` vs `node.content` |
| **Storage** | `unsavedChanges` Map: `nodeId → { content, originalContent }` |
| **Mode** | **Dual mode:** Auto-save OR manual save (controlled by `localStorage.autoSaveEnabled`) |
| **Auto-save** | When enabled: calls `updateNodeContent()` immediately on blur |
| **Manual save** | When disabled: adds to `unsavedChanges`, shows buttons, waits for explicit Save |
| **Visual feedback** | `.unsaved` class on edited nodes; buttons show count e.g. "Save Changes (3)" |
| **Discard** | Restores `originalContent` to DOM and local `nodes` array, clears `unsavedChanges` |

**Button visibility:** When `autoSaveEnabled` is true, Save/Discard buttons are hidden. When false, both are always visible (even with 0 changes).

---

### 1.2 Graph Plugin — `plugins/graph/app.js`

**Location:** Toolbar buttons in `plugins/graph/index.html`

**Behavior:**

| Aspect | Implementation |
|--------|----------------|
| **Trigger** | Graph mutations via callbacks: `onNodeCreate`, `onNodeUpdate`, `onNodeDelete`, `onEdgeCreate`, `onEdgeUpdate`, `onEdgeDelete` |
| **Storage** | `unsavedChanges = { nodes: Map(), edges: Map() }` with typed changes: `create`, `update`, `delete` |
| **Original state** | `originalState = { nodes: Map(), edges: Map() }` populated on load from DB |
| **Mode** | **Manual only** — no auto-save toggle; all changes batched until Save |
| **Button visibility** | Buttons hidden when no changes; shown with count when `hasChanges` |
| **Save** | Iterates changes, calls `saveNodeToDb`/`updateNodeInDb`/`deleteNodeFromDb` for nodes; analogous for edges |
| **Discard** | Restores from `originalData`; for creates, removes from graph; re-renders graph |

**Key difference:** Graph plugin is fully manual. Node/Edge dialogs have "Save" buttons that only update local graph state and track changes; persistence happens only when the main "Save Changes" button is clicked.

---

### 1.3 Other Components

| Component | Save Behavior |
|-----------|---------------|
| **Settings Manager** | Modal footer "Save Changes" → saves current section to localStorage; per-section save |
| **Image Viewer** | Per-field Save buttons (rating, ranking, description) → immediate API save |
| **WebP Converter** | `saveSettings()` called on change → immediate localStorage write (effectively auto-save) |

---

## 2. Strengths of Current Design

1. **Graph plugin model** — Clean separation: track changes in memory, persist only on explicit Save. No auto-save logic, single source of truth in `originalState`.
2. **Change typing** — Graph uses `create`/`update`/`delete` for proper discard semantics (e.g., undo creates by removing, undo deletes by re-adding).
3. **Visual indicators** — `.unsaved` class, button count, pulse animation on `has-unsaved` help users see pending work.
4. **Button state** — Disabled + "Saving..." / "Discarding..." during async ops prevents double-submit.
5. **Success feedback** — Temporary "Saved!" / "Discarded N changes!" text.

---

## 3. Weaknesses & Gaps

### 3.1 Main App — Auto-Save vs Manual Split

- **Default is auto-save** — `getAutoSaveEnabled()` returns `true` when not set, which contradicts preference for manual control.
- **Button visibility logic** — In manual mode, Save/Discard are always visible even with 0 changes. Graph plugin hides them when clean; main app could follow same pattern for consistency.
- **No beforeunload warning** — Leaving the page with unsaved changes does not warn the user. Risk of data loss.
- **autoSaveInterval unused** — Settings store `autoSaveInterval` but it is not used for periodic saving. Dead or future feature.

### 3.2 Graph Plugin

- **Sequential save** — `saveAllChanges()` processes nodes then edges sequentially. Could be parallelized where there are no dependencies.
- **No partial rollback** — If one save fails mid-batch, some DB writes may have succeeded; no transactional rollback or clear partial-state handling.

### 3.3 Cross-Cutting

- **Inconsistent patterns** — Main app: blur + optional auto-save. Graph: callbacks + always manual. Settings: modal save. Image Viewer: per-field save. No unified pattern for "manual vs auto."
- **No shared abstraction** — Each feature implements its own `unsavedChanges`, `updateSaveButtonVisibility`, etc. Reuse would reduce bugs and divergence.

---

## 4. Recommendations for Improvement

### 4.1 Prioritize Manual Save as Default

- Set `localStorage.autoSaveEnabled` default to `false` (or remove auto-save for content, keep it only as opt-in).
- Make manual save the primary model for user-controlled data.

### 4.2 Add Navigation/Close Warnings

```javascript
window.addEventListener('beforeunload', (e) => {
  const hasMain = unsavedChanges?.size > 0;
  const hasGraph = /* check graph plugin if applicable */;
  if (hasMain || hasGraph) {
    e.preventDefault();
  }
});
```

Consider routing/navigation libraries (e.g., SPA routers) and warn on internal route changes if applicable.

### 4.3 Unify Button Visibility

- **Main app:** Hide Save/Discard when `unsavedChanges.size === 0` (match graph plugin).
- **Both:** Use same pattern: show only when there are changes; hide when clean.

### 4.4 Optional: Shared Save State Module

Create a small module, e.g. `saveStateManager.js`, that:

- Exposes `registerSource(id, { getChanges, save, discard })`
- Tracks all sources, aggregates `hasUnsavedChanges`
- Provides `saveAll()`, `discardAll()`, `beforeunload` wiring
- Plugins and main app register themselves; one place for warnings and coordination

---

## 5. Design Guide for Similar Projects

Use this checklist when implementing manual Save/Discard in other projects.

### 5.1 State Model

| Requirement | Guidance |
|-------------|----------|
| **Track changes** | Use a Map or similar structure: `id → { current, original }` or `id → { type, data, originalData }` |
| **Store original** | Always keep original state for discard; load it when data is first fetched or when user starts editing |
| **No implicit saves** | Avoid blur/change handlers that persist automatically; defer persistence to explicit Save |

### 5.2 UI Components

| Component | Behavior |
|-----------|----------|
| **Save button** | Visible when there are changes; disabled during save; shows count if helpful (e.g. "Save Changes (3)") |
| **Discard button** | Same visibility rules; disabled during discard |
| **Visual indicator** | Mark modified items (e.g. `.unsaved`, border, icon) so user knows what will be saved |
| **Feedback** | After save: brief "Saved!" or "Saved N items"; after discard: "Discarded N changes" |

### 5.3 Persistence Flow

```
User edits → update in-memory / DOM only
           → add to unsavedChanges (with original)
           → update button visibility

User clicks Save → disable buttons, show "Saving..."
                → persist each change (API/localStorage)
                → on success: remove from unsavedChanges
                → on complete: re-enable, show feedback

User clicks Discard → disable buttons, show "Discarding..."
                   → restore original to in-memory/DOM
                   → clear unsavedChanges
                   → re-enable, show feedback
```

### 5.4 Edge Cases

| Case | Handling |
|------|----------|
| **Save fails partially** | Decide: retry, show which failed, or rollback. Document behavior. |
| **User navigates away** | Use `beforeunload` (or router guard) to warn when `unsavedChanges` is non-empty |
| **Concurrent edits** | If multi-user or multi-tab: consider conflict resolution; at minimum, document single-user assumption |
| **Large batches** | Consider chunking, progress indicator, or background save with retry |

### 5.5 Code Checklist

- [ ] No automatic save on blur, change, or timeout unless explicitly opt-in
- [ ] `unsavedChanges` (or equivalent) populated on edit, cleared on Save or Discard
- [ ] `originalState` stored for each change for correct discard
- [ ] Save/Discard buttons hidden or disabled when no changes
- [ ] Buttons disabled during async Save/Discard
- [ ] `beforeunload` (or equivalent) warns when unsaved changes exist
- [ ] Success and error feedback shown to user
- [ ] For create/update/delete: discard correctly reverses each type (remove created, restore deleted, revert updated)

---

## 6. Summary

| Area | Current | Recommended |
|------|---------|-------------|
| **Default mode** | Auto-save on (main app) | Manual save default |
| **Button visibility** | Main: always in manual mode | Show only when changes exist |
| **Navigation loss** | No warning | `beforeunload` when unsaved |
| **Graph plugin** | Fully manual ✓ | Keep as reference implementation |
| **Abstraction** | Per-feature implementation | Optional shared save state module |
| **dead config** | `autoSaveInterval` stored, unused | Remove or implement |

The **graph plugin** is the strongest example of a manual-save workflow: all mutations are tracked, nothing persists until the user clicks Save, and Discard correctly restores from `originalState`. Use it as the reference when adding similar save buttons elsewhere.
