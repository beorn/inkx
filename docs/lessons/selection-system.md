# Selection System: Design and Migration Lessons

**TL;DR**: Build for your one consumer first, extract when the second arrives. Lost worktree commits cost more than any design round. Pure state machines beat imperative handlers every time.

**Keywords**: selection, design, migration, state machine, worktree, industry research, naming

---

## Background

The `@silvery/selection` project was a major multi-session effort: designing and implementing a unified reactive selection system for silvery apps, then migrating km-tui (~47 files, ~500 references) to use it. The design went through 8+ review rounds with GPT 5.4 Pro, multiple `/big` reframes, and extensive industry research (tldraw, ProseMirror, Excalidraw, Figma, SlateJS, DOM Selection API).

---

## Lesson 1: Design Convergence Through Rounds

**What happened**: Started with 7 types and 2 namespaces (`Selection.*` + `Selecting.*`). Ended with 1 factory (`createSelection`) and grouped sub-objects (`sel.node.*`, `sel.text.*`, `sel.drag.*`, `sel.root.*`).

Each simplification round removed concepts. The final design has fewer moving parts than km's original scattered state.

**Key reframe**: "What if this was easy?" Stopped designing a library for hypothetical consumers (canvas, diagramming, rich text editors) and asked what km actually needed right now. The answer was dramatically simpler than what 8 rounds of library design had produced.

**Rule**: Each design round should remove concepts, not add them. If a round makes things more complex, something is wrong with the framing. Step back and ask "what if this was easy?"

---

## Lesson 2: Lost Commits from Worktrees

**What happened**: THREE separate agents completed their work but didn't commit to their worktrees. When the worktrees were cleaned up, all code was lost. Even after adding explicit commit instructions, one P1 agent (96 tests, 12 apply functions) had to be rebuilt from scratch.

**Root cause**: Agents weren't explicitly told to commit. The default assumption was that the worktree would persist, but worktrees are ephemeral by design — they get cleaned up when the session ends.

**Fix**: Every agent prompt now includes "CRITICAL: COMMIT before finishing. Uncommitted worktree work gets lost." This must be in the prompt itself, not assumed as convention.

**Rule**: Worktree code that isn't committed doesn't exist. Treat uncommitted worktree work the same as work you never started — because after cleanup, that's exactly what it is.

**See also**: [Worktree Discipline](worktree-discipline.md) — the broader principle that isolation steps are prerequisites, not optional ceremony.

---

## Lesson 3: Industry Research Pays Off

**What happened**: Before writing any code, we studied how established projects handle selection:

- **tldraw**: 18-state `SelectTool` state machine validated our pointer state machine design (idle, pointing, dragging, brushing phases).
- **ProseMirror**: `Selection.transform(sel, op)` inspired the SlateJS alignment where tree ops transform selection inline.
- **Decker**: 3 state sources + browser-inconsistent drag events + 500+ lines of imperative handlers motivated the "one state atom, pure state machine" architecture.
- **Excalidraw/Figma**: Multi-selection patterns (anchor + extends, shift-click toggle) informed the set-based selection model.
- **SlateJS**: Tree operations that transform selection in the same `apply()` call — atomic, no stale gap.
- **DOM Selection API**: Anchor/focus/direction semantics for text selection.

**Key insight**: The research wasn't academic — every design decision mapped to a proven pattern in at least one production system. The difference is that our system composes the best ideas from each (pure state machines from tldraw's shape, inline reconciliation from SlateJS, reactive projection from signals) without inheriting their baggage (tldraw's OOP side effects, SlateJS's plugin ordering problems).

**Rule**: Before designing a system that multiple production apps have already solved, spend a day studying them. The right 8 hours of research saves weeks of wrong turns.

---

## Lesson 4: Pure State Machine > Imperative Handlers

**What happened**: Decker's selection system had 500+ lines of imperative `onPointerDown`/`onPointerMove`/`onPointerUp` handlers with state in closures. Drag state was split across React state, refs, and browser events. Debugging required reproducing exact mouse movement sequences — impossible to unit test.

Our design: pure `(state, event) -> [state, effects]` transitions. Every pointer interaction is a logged, replayable, testable state transition.

**Why this matters**:

- **Testable without DOM**: No mouse events, no timeouts, no browser state. Feed actions, assert state.
- **Replayable**: Log the action stream, replay it to reproduce any bug.
- **Composable**: Pointer state machine composes with selection state machine via effects — no tangled event handlers.
- **Portable**: Same state machine works in terminal (mouse events) and browser (pointer events). Only the input adapter changes.

**Comparison with tldraw**: tldraw uses OOP `StateNode` classes with side effects (e.g., `editor.setSelectedIds()`). Our improvement is that transitions are pure functions — testable without instantiating a full `Editor`/`App` object.

**Rule**: If it handles user input, model it as a state machine. If the state machine has side effects, extract them as returned effect descriptions. The handler should be `(state, action) -> [state, effects]`, nothing more.

---

## Lesson 5: One Store, Not Plugins

**What happened**: Initial design had composable plugins: `withBoardSelection`, `withStickyCursor`, `withViSelection`. Each would intercept and extend the base selection behavior.

This created ordering and interception problems before any code was written. Which plugin gets first crack at a key event? How do plugins communicate? What happens when two plugins both want to modify the same selection field?

**Simplification**: One store, all selection interactions in one place. km adds board-specific behavior as app code (reading from the store, dispatching actions), not as middleware or plugins that intercept the store.

**Key insight**: "Extract when the second consumer reveals the real boundaries." We don't know where the plugin seams should be until a second app (not km) needs selection. Speculative boundaries are almost always wrong.

**Rule**: Start with one store, one set of actions, one reducer. If it gets big, split by domain (node selection vs text selection vs drag) — but keep it in one store. Plugin architectures are for when you have multiple consumers with known, different needs.

---

## Lesson 6: Signals for Projection, State Machine for Decisions

**What happened**: Tried to make the whole selection system signals-based (alien-signals / computed). Pointer interactions are half events (discrete: click, double-click, Enter) and half continuous (hover position, drag coordinates, selection range).

Signals excel at projecting and transforming state — "the current selection as a Set", "is this node selected?", "the drag rectangle bounds". But they're wrong for decisions with conditions — "if double-click and node is text-editable, enter text edit mode" is an if-statement, not a derivation.

**Resolution**: Pure state machine handles the discrete decisions (click, double-click, drag start/end, keyboard selection). Signals project the state for UI consumers (computed `isSelected`, `selectionCount`, `dragBounds`).

**Rule of thumb**: If it has an `if` statement, it belongs in the state machine. If it's projecting or transforming existing state for consumers, it belongs in a signal/computed.

---

## Lesson 7: Naming Converges Through Usage

**What happened**: Naming churn across 8+ rounds:

- `focus` -> `active` -> `cursor` (for the primary selected node)
- `committed`/`preview`/`effective` -> `selected`/`selecting`/`selection` -> just `sel.selection` (one public set)
- `selectAll` (confused with Cmd+A) -> `expandSelection` -> back to `selectAll` (progressive disclosure by default)

**Why names kept changing**: Each design round changed what the concept meant. When we had committed vs preview selection, "committed" made sense. When we collapsed them into one set, "committed" was meaningless. The name was correct for the design at the time — but the design was still converging.

**Resolution**: The final names came from asking "what would I type when using this?" Not "what is the theoretically correct term" but "what autocomplete suggestion would make me say 'yes, that's what I want'."

**Rule**: Don't bikeshed names during design. Use placeholder names, converge the design, then name the final concepts. Names that survive are the ones that feel obvious when you're writing code that uses them.

---

## Lesson 8: Don't Mix Snapshot Undo and Inverse-Op Undo

**What happened**: Initially planned snapshots for selection undo (selection state is small, snapshots are simple) and inverse-ops for tree undo (tree state is large, snapshots are expensive).

The user correctly identified: two undo systems is two too many. Every undo-aware subsystem would need to know which system to use. Undo/redo would need to interleave operations from both systems. Testing would double.

**Solution**: Inverse-op everywhere. Selection inverse = restore previous field values (a few bytes). Tree inverse = structural inverse (insert/delete/move). One undo stack, one system, atomic undo of tree+selection together.

**SlateJS alignment**: Tree ops transform selection inline in the same `apply()` call. Undo reverses both the tree change and the selection change atomically. No "undo the tree, then separately undo the selection" sequencing.

**Rule**: One undo system. If a subsystem's state is small enough for snapshots, it's also small enough for inverse-ops (the inverse is just "restore these 3 fields"). The simplicity of one system outweighs the simplicity of snapshots for small state.

---

## Lesson 9: Batch Refactor for Mechanical Changes, Agents for Judgment

**What happened**: The km migration touched 51 files with ~500 references. Two distinct categories of work:

1. **Mechanical** (80%): Rename `boardState.selectedNodeId` to `sel.node.cursor`, replace `setSelectedNodeId(id)` with `sel.node.setCursor(id)`, update imports. The batch-refactor tool (`bun tools/refactor.ts`) handles this — pattern match, transform, apply.

2. **Judgment** (20%): Wiring the selection store into the app lifecycle, choosing how to bridge alien-signals -> Zustand reactivity, deciding which text edit state hints to preserve vs discard, resolving the 30 remaining test failures that came from the bridge gap.

**Rule**: Identify the mechanical vs judgment split before starting a migration. Use automated tooling for the mechanical part (it's faster and less error-prone). Reserve agent/human time for the judgment calls. Don't have an agent manually rename 500 references — that's what sed and refactor scripts are for.

---

## Lesson 10: Reconciliation Should Be Inline, Not an Effect

**What happened**: Initial design: tree changes fire an effect, the effect reconciles selection (prunes deleted nodes from the selection set, adjusts cursor if its node moved). This is async — there's a gap between the tree change and the selection update where the selection references nodes that no longer exist.

**SlateJS pattern**: Tree op transforms selection in the same `apply()` call. Delete a node? The same function that removes it from the tree also removes it from the selection set. Move a node? The same function updates the selection's reference. Atomic, no stale gap.

**Why this matters**: With async reconciliation, any code that reads selection between the tree change and the reconciliation effect sees stale data. This is a class of bug that's invisible in unit tests (effects run synchronously in tests) but manifests in real apps (effects are batched, deferred, or dropped).

**Rule**: "Reconcile" as a separate concept is a design smell. If state B must be consistent with state A, update them in the same function call. Don't change A, then schedule an effect to fix B. The gap between "change" and "reconcile" is where bugs live.

---

## 5 Whys: Why Did the Design Take 8+ Rounds?

1. **Why did it take 8+ rounds?** Because each round added concepts instead of removing them.

2. **Why did each round add concepts?** Because we were designing for hypothetical consumers — canvas selection, diagramming tools, rich text editors that don't exist yet.

3. **Why were we designing for hypothetical consumers?** Because we wanted the selection system to be "general" — a library that any silvery app could use.

4. **Why did we want it to be general?** Because silvery is a framework, and frameworks should provide general-purpose building blocks.

5. **Why is that a problem?** Because you can't design a good library without at least two consumers. With only km, the "general" design was speculative — we were guessing what canvas apps and diagram tools would need, and every guess added complexity.

**Root cause**: Premature generalization. Designing a library for consumers that don't exist yet produces a design that serves none of them well.

**Fix**: Build for km first, extract when the second consumer arrives. The design is extensible (`sel.sub` polymorphism, pointer state phases) but the implementation ships exactly what km needs. When a second silvery app needs selection, the real boundaries will reveal themselves — and they'll almost certainly be different from what we guessed.

**The reframe that broke the cycle**: "What if this was easy?" Instead of "how do we design a selection system that handles canvas, text, tree, and diagram selection" — ask "what does km need right now?" The answer was: cursor, multi-select set, text edit flag, drag state. Four things. Not seven types and two namespaces.

---

## See Also

- [Worktree Discipline](worktree-discipline.md) — why uncommitted worktree work gets lost
- [Refactoring Lessons](refactoring.md) — migration patterns (break intentionally, purge aggressively)
- [Reproduce First](reproduce-first.md) — verify with real data before theorizing
- [docs/design/tea.md](../design/tea.md) — the pure state machine architecture
- [docs/design/ui/selection.md](../design/ui/selection.md) — the selection model specification
