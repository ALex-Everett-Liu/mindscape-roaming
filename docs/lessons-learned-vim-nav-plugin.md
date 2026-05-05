# Lessons Learned: Vim Navigation Plugin Development

Mistakes made during the `third-party-vim-nav` plugin development, and how to avoid them.

---

## 1. Terminology Is Ambiguous — Always Clarify

**What happened**: We used the word "focus" without defining it. The codebase uses `.focused` as a CSS class for node selection. The bullet button tooltip says "Focus on this node" but actually calls `store.zoomIn()`. The user meant "zoom into the node." We implemented CSS class manipulation.

**Lesson**: When a user uses a word that already appears in the codebase with a different meaning, ask explicitly. _"You said 'focus.' Do you mean zoom-into (clicking the bullet button, showing that node's children as roots), or do you mean select/highlight the node row?"_ One sentence saves hours.

---

## 2. When the User Says "X Works, Y Doesn't," Compare X and Y Immediately

**What happened**: The user said breadcrumb/panel jumping worked fine, but outline node jumping didn't work. Breadcrumbs call `store.zoomIn()`. We should have immediately tried `store.zoomIn()` for nodes too. Instead we chased DOM manipulation.

**Lesson**: The moment a user says "A works, B doesn't," stop and look at what A does. B probably needs the same thing.

---

## 3. Don't Fight the Framework

**What happened**: We discovered that `store.setFocusedNode()` triggers Preact's `NodeEditor` `useEffect` which auto-focuses the contenteditable. We then wrote code to blur the editor after it auto-focused — a fragile timing hack that sometimes worked and sometimes didn't.

**Lesson**: If the framework auto-does something you don't want, the answer is usually **don't call the method that triggers it**, not "call it and then undo the side effect." In this case, the real answer was `store.zoomIn()` — a completely different method.

---

## 4. The Simplest Fix Is Usually Right

**What happened**: We wrote ~30 lines of DOM class manipulation, double `requestAnimationFrame` timing hacks, and blur-after-focus workarounds. The actual fix was 1 line: `store.zoomIn(nodeId)`.

**Lesson**: If a fix requires `requestAnimationFrame`-inside-`requestAnimationFrame`, polling, or undoing side effects, you're solving the wrong problem. Take a step back.

---

## 5. Debug Logs Are Self-Flattering If You Log Internal Calls

**What happened**: We added debug logging early. But the logs only recorded **what functions our code called** — `setFocusedNode`, `zoomIn`, `blur`, `requestAnimationFrame`. Every log line confirmed we wrote the code "correctly." Meanwhile the screen showed both modes producing the same result. We read each other's debug dumps 50+ times and learned nothing.

The user never said the two modes behaved differently — they said the opposite every round. The logs said "the code is executing different branches." The screen said "nothing changed." The logs lied because they measured the wrong thing.

**Lesson**: 
- Bad log: `JUMP focus-mode: setFocusedNode(id)` — tells you what API got called (always looks correct)
- Good log: `JUMP result: viewport=${store.getState().tree.length} children | editorActive=${document.activeElement?.classList.contains('node-editor')} | breadcrumbs=${store.getState().breadcrumbs.length}` — tells you what the user sees

A debug log that always looks correct is worse than no debug log. It builds false confidence and wastes rounds.

---

## 6. The User Telling You "It's Broken" IS the Debug Log

**What happened**: The user told us "两个模式根本没区别" (the two modes are no different) in nearly every round. We ignored this and chased phantom bugs — stale DOM references, Preact timing, blur-after-focus — because our debug log showed "different code paths."

**Lesson**: The user's screen is the ground truth. A debug log that contradicts the user's report is wrong, not the user. Stop tracing code paths and look at the screen.

## 7. Read the User's Environment, Not Just Their Words

**What happened**: The user is Chinese-speaking. The word "focus" in English has multiple meanings (select vs zoom). In Chinese, the user consistently said "跳转" (jump/navigate) and "focus到那个节点上" — they wanted the viewport to jump to that node's context. We interpreted "focus" through the lens of the code's internal naming (`.focused` CSS class).

**Lesson**: When working across languages, look at what the user is **doing** (what buttons they click, what behavior they reference) more than the specific English words they use. They pointed at the bullet button with "Focus on this node" — that's `store.zoomIn()`.

---

## 8. A Diff Tells You When You're Overcomplicating

**What happened**: The `jumpTo` function grew to 35+ lines with DOM queries, class toggles, and async timing hacks.

**Lesson**: If a function that should be 3 lines (call one store method based on mode) grows to 35, stop and ask: _"Am I solving the user's problem, or a problem I invented?"_

## 9. Debug Logs Must Capture User-Visible Effects, Not Internal Calls

**What happened**: We logged `JUMP edit-mode: setFocusedNode(...)` and `JUMP focus-mode: zoomIn(...)`. During the broken phase, both paths were actually just manipulating `.focused` CSS classes — the logs **said different things** but the **screen looked identical**. Rereading the same debug log 50 times would never catch this.

The user caught it by noticing the `.focused` class manipulation in our internal reasoning, then verifying on screen that both modes produced the same visual result.

**Lesson**: Log what **changed for the user**, not what functions were called.
- Bad: `JUMP focus-mode: setFocusedNode(id)` — internal API call
- Good: `JUMP focus-mode: viewport now showing N children | editor cursor active: yes`

If two log entries look different in code but produce identical screenshots, the log format is wrong.

---

## Summary Checklist for Future Plugins

- [ ] Clarify every ambiguous term before writing code
- [ ] When user says "this works, that doesn't" → diff the two paths
- [ ] Add `debugLogs` + dump command before any complex logic — **but log user-visible state, not internal API calls**
- [ ] If the fix needs `requestAnimationFrame` nesting, reconsider the approach
- [ ] Match existing behavior first, then extend
- [ ] If a function grows past 10 lines for a seemingly simple task, pause
- [ ] **The user's screen is the ground truth. If a debug log says "different" and the screen says "same," the log is wrong.**
