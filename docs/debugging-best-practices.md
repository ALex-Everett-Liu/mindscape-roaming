# Debugging Best Practices for Mindscape Roaming

Lessons from the page-mode plugin debugging session (v0.3.4).

---

## 1. Make Logs Accessible to the Agent

**Problem:** `console.log` output lives in the renderer's DevTools — invisible to the coding agent. Every log line must be manually copied by the human, creating friction and delay.

**Solution:** Always route debug logs through a buffer that can be dumped to a file. Pattern:

```typescript
const debugLogs: string[] = [];
function logDebug(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ${msg}`;
  console.log(line);        // human sees it in DevTools
  debugLogs.push(line);     // agent can retrieve it via download
}
```

Add a command-palette command that downloads `debugLogs` as a `.txt` file:

```typescript
ctx.registerCommand({
  id: "plugin-dump-logs",
  name: "Dump Debug Logs",
  execute: () => {
    const blob = new Blob([debugLogs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `debug-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },
});
```

**Principle:** If the agent can't see your logs, you're debugging alone. Always provide a download path.

---

## 2. Preact Attribute Rendering — Don't Use `html\`attr-name\`` in Tag Bodies

**Problem:** This does NOT create an HTML attribute:

```typescript
// WRONG — creates a VNode/text node, not an attribute
${node.is_page ? html`data-is-page` : ""}
```

Preact/HTM interprets free-floating `html\`...\`` inside a tag as child content, not as an attribute. The CSS selector `[data-is-page]` never matches.

**Solution:** Always use `name=${value}` syntax:

```typescript
// CORRECT — renders data-is-page="" when true, removes attribute when false/undefined
data-is-page=${node.is_page ? "" : undefined}
```

**Verification:** Open DevTools → Elements, inspect the rendered DOM. If the attribute is missing, you wrote the template wrong.

---

## 3. Stale In-Memory Tree After `api.updateNode()`

**Problem:** Calling `api.updateNode({ id, is_page: true })` writes to the database but does NOT update `store.getState().tree`. The in-memory tree retains the old value. On the next store update (e.g., Save), `syncPageCacheFromStore()` rebuilds from the stale tree and loses the change.

**Solution:** Update the in-memory tree BEFORE the API call, mirroring how `store.toggleExpanded()` works:

```typescript
// In store.ts — correct pattern
togglePage(id: string): void {
    const node = this.findNodeInTree(id);
    if (!node) return;
    const newPage = !node.is_page;
    this.updateNodeInTree(id, { is_page: newPage });  // update local tree FIRST
    this.markModified(id);
    api.updateNode({ id, is_page: newPage })           // then persist to DB
        .then(r => { if (!r.success) console.error(...) });
}
```

**Principle:** Local state must anticipate the remote state. Never rely on the DB write to update the local tree — it won't happen until the next `loadTree()`.

---

## 4. Node Location: Tree vs Breadcrumbs

**Problem:** When the user is zoomed into a node, that node lives in `store.getState().breadcrumbs`, NOT in `store.getState().tree`. Functions that search only the tree (e.g., `findNodeInTree`) miss the zoomed node entirely.

**Impact:** 
- `syncPageCacheFromStore()` builds an empty page cache (page node invisible to the system)
- `togglePage()` returns early because `findNodeInTree` returns null
- `scanAndTransform()` sees `pageIds.size=0` and unwraps everything

**Solution:** Always check both data sources:

```typescript
// syncPageCacheFromStore — check both
function syncPageCacheFromStore(): void {
  const next = new Set<string>();
  const stack = [...store.getState().tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.is_page) next.add(node.id);
    stack.push(...node.children);
  }
  // Also check breadcrumbs — the zoomed page node lives here
  for (const crumb of store.getState().breadcrumbs) {
    if (crumb.is_page) next.add(crumb.id);
  }
  pageIds = next;
}

// togglePage — fall back to breadcrumbs
togglePage(id: string): void {
    let node = this.findNodeInTree(id);
    if (node) { /* update tree */ return; }
    // Node is the zoomed node — update breadcrumbs instead
    const idx = this.state.breadcrumbs.findIndex(b => b.id === id);
    if (idx === -1) return;
    /* update breadcrumbs[idx] and call this.update({ breadcrumbs }) */
}
```

**Principle:** At any zoom level, a node is either in the tree OR in the breadcrumbs. Never assume it's in the tree.

---

## 5. Reflexive Focus Trap — Browser Re-Focuses After DOM Removal

**Problem:** When the user leaves a page (navigates to an ancestor), the previously focused child editor is removed from the DOM. The browser auto-focuses the nearest focusable element — often the page node's editor. `handleFocusIn` fires on the page node, detects `isPage=true` and `zoomedId !== nodeId`, and zooms back into the page. The user is trapped.

**Log signature:**
```
focusin: editor nodeId=PAGE, isPage=true, zoomedId=ANCESTOR
focusin: NOT in page, zooming in to page node PAGE
focusin: editor nodeId=PAGE, isPage=true, zoomedId=PAGE
```
Repeating every ~1-2 seconds — the user navigates out, gets pulled back in.

**Solution:** Track the timestamp of the last zoom change and ignore `focusin` events within a short window (400ms):

```typescript
let lastZoomChangeTime = 0;

// In store subscriber:
if (state.zoomedNodeId !== lastZoomedId) {
    lastZoomedId = state.zoomedNodeId;
    lastZoomChangeTime = Date.now();
    // ...
}

// In handleFocusIn:
if (zoomedId !== nodeId) {
    if (Date.now() - lastZoomChangeTime < 400) return;  // ignore reflexive focus
    // ... zoom in
}
```

**Principle:** Focus events fired by the browser (not the user) happen within ~200-300ms of a DOM restructure. Debounce with a timestamp, not a flag — flags can be set/cleared in the wrong order.

---

## 6. MutationObserver Feedback Loops

**Problem:** Functions that modify the DOM (setting `innerHTML`, adding/removing children, toggling classes in `childList`-watched subtrees) trigger the `MutationObserver`, which schedules a `requestAnimationFrame` that calls the same function again.

**Log signature:** Hundreds or thousands of identical log lines in rapid succession.

**Solution A — Content diff before DOM write (preferred):**

```typescript
let lastAncestorHTML = "";
function updateAncestorPanel(): void {
  // ... build html string ...
  if (html === lastAncestorHTML) return;  // skip if unchanged
  lastAncestorHTML = html;
  ancestorsPanel.innerHTML = html;
}
```

**Solution B — Re-entrancy guard:**

```typescript
let scanning = false;
function scanAndTransform(): void {
  if (scanning) return;
  scanning = true;
  try { /* ... */ } finally { scanning = false; }
}
```

**Solution C — Don't schedule rAF on every store update:**

Only schedule `scanAndTransform` when the tree or zoom actually changes:

```typescript
// Compare tree reference or length, not just zoomedNodeId
let lastTreeLength = 0;
unsubStore = store.subscribe((state) => {
    if (state.zoomedNodeId !== lastZoomedId ||
        state.tree.length !== lastTreeLength) {
        requestAnimationFrame(() => scanAndTransform());
    }
});
```

**Principle:** A DOM mutation that triggers a callback that causes another DOM mutation is an infinite loop. Always diff before writing, or guard against re-entry.

---

## 7. Wrap/Unwrap Content Flip-Flop

**Problem:** `scanAndTransform()` wraps page nodes (adds `.page-wikilink-wrapper` span) and unwraps non-page nodes. If `isPage()` returns inconsistent results between calls (stale cache, tree reload mid-frame), the same node gets wrapped, then unwrapped, then wrapped — each operation triggers a `MutationObserver` callback that schedules another `scanAndTransform`.

**Root causes:**
- `syncPageCacheFromStore()` clears and rebuilds the cache during a frame
- The cache rebuild reads from old tree data (see lesson #3)
- The DOM mutation from wrapping triggers the observer before the cache is rebuilt

**Fix:** Ensure the source of truth (`is_page` in tree/breadcrumbs) is updated BEFORE the DOM is modified. See lessons #3 and #4.

---

## 8. `data-is-page` Attribute: DOM Manipulation vs Preact Render

**Problem:** Setting `data-is-page` via `nodeEl.setAttribute()` is fragile — Preact re-renders recreate the DOM element, losing the attribute until `scanAndTransform` runs again. Between the re-render and the next rAF, children are visible (the CSS hiding fails).

**Solution:** Render `data-is-page` in the Preact component itself, using the node's `is_page` property:

```typescript
// In OutlineNode.ts — render-time attribute, survives all re-renders
<li class="outline-node ..."
    data-node-id=${node.id}
    data-is-page=${node.is_page ? "" : undefined}>
```

This makes the attribute part of the virtual DOM diff. Preact preserves it across re-renders as long as `node.is_page` is truthy.

**Principle:** If a DOM attribute needs to survive Preact re-renders, it must be part of the Preact JSX/output. External `setAttribute()` calls are lost on re-render.

---

## Quick Reference: Debugging Checklist

When a feature "works sometimes but not always", check:

1. [ ] **Is the in-memory state updated before the API call?** (Lesson #3)
2. [ ] **Is the node in the tree or in breadcrumbs right now?** (Lesson #4)
3. [ ] **Is a MutationObserver feedback loop running?** (Count log lines — more than ~20 per second = loop)
4. [ ] **Is the attribute rendered by Preact or set by DOM manipulation?** (Lesson #8)
5. [ ] **Is a focus/blur handler re-entering after DOM removal?** (Check for focusin right after zoom change)
6. [ ] **Are the Preact template expressions generating actual HTML attributes?** (Lesson #2)
7. [ ] **Can the agent see the logs?** (Lesson #1 — add a dump command)
