---
mentions:
  - km
  - Bjørn
id: "@km/tui/hierarchical-node-state"
aliases:
  - km-tui.hierarchical-node-state
  - km-tui-hierarchical-node-state
created_by: Bjørn Stabell
created_at: 2026-04-07T18:45:12Z
closed_at: 2026-04-08T08:18:21Z
close_reason: "All 5 phases complete. Reduced signal engine built (21 unit
  tests), cursorDescendant + selectedAncestor + editingDescendant wired and cut
  over. Old cursorInDescendant purged. 217 test files pass (5755 tests).
  Commits: b4507db28, 35b7d47db, 7c11c80c5, 7adef8f4c, d739625f0, 825c2d424."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Reduced signals — tree.ancestors/descendants declarative state + tree.up/down imperative iteration @km/tui #feature #P1 @Bjørn Stabell

Replace ad-hoc per-node state propagation (syncCursor, syncSelected, syncEdit, hydrate) with reduced signals — cached pure functions over tree walks, incrementally recomputed on change.

## Design docs

- docs/design/tree-reduce.md — API, semantics, worked examples, migration strategy
- docs/design/node-visual-spec.md — state × role × visual treatment matrix
- docs/design/selection-state-spec.md — 5 state concepts, mode ladder (from @km/tui/focus)

## Blast radius (from grep audit)

~375 references across ~50 source files + docs. Heaviest:

- cursorCardNodeId: 54 refs / 15 files
- cursorColumnNodeId: 40 refs / 15 files
- isNodeSelected: 40+ refs / 7 files
- isColumnSelected: 35 refs / 5 files
- isBoardSelected: 23 refs / 4 files
- cursorDepth: 20+ refs / 10 files

Critical files (most changes):

1. reactive.ts — core refactor (remove sync methods, add reduced signals)
2. Board.tsx — remove syncCursor/syncSelected/syncEdit calls
3. CardColumn.tsx — adapt cursorInDescendant, expandedEditCardId, isColumnSelected, cardBg
4. TreeNode.tsx — adapt shouldStripColor, cursorInDescendant, expandedEditCardId

## Final API

### Declarative (state definitions)

\`\`\`ts
state: () => ({
  cursor: signal(false),
  selected: signal(false),
  cursorDescendant: tree.descendants(s => s.cursor).some(),
  selectedAncestor: tree.ancestors(s => s.selected).some(),
  excludedSigils: tree.ancestors(s => s.ownSigils).reduce(concat, []),
})
\`\`\`

Reads are O(1) — backed by cached/incremental aggregates (counts not booleans). Writes are O(depth).

### Imperative (navigation, search, loops)

\`\`\`ts
tree.up(nodeId)    // parent chain iterator
tree.down(nodeId)  // DFS iterator
\`\`\`

## Phases

### Phase 0: Characterize (BEFORE refactor)

- Run golden baseline tests: cursor-colors.test.ts, board-selection.slow.spec.ts, column-rendering.test.ts
- Add 5 missing golden tests (cursor-in-descendant all levels, edit expansion, sigil filtering, batch atomicity, signal sync)
- Rewrite board-test.ts helper (~400 LOC) for batch() semantics
- Capture cursor-perf bench baseline
- Fix pre-existing test failures (4 in windowing-wire + symlink from focus session)

### Phase 1: Core engine

Build reduced signal engine: tree.ancestors/descendants descriptors, store.batch(), TreeAccess. Reuse tree-concerns.ts internals but NOT prototype API.

### Phase 2: Shadow — cursor + selection

Shadow implementation alongside old sync. One facade, one active path. Compare semantically.

### Phase 3: Cutover — switch reads

Components read from reduced signals. Old sync becomes shadow oracle. Bench: content render ≤ baseline.

### Phase 4: Purge + Remove

Delete old sync. Bounded deadline. Bench: wall time ≤ baseline.

### Phase 5: Editing + sigils

Add editingDescendant and excludedSigils. Delete syncEdit + hydrate sigil walk.

## Acceptance criteria (grep-verifiable)

### Phase 4 gates (sync methods + store-level signals → 0)

\`\`\`bash

## All must return 0 (excluding .beads/, vendor/, docs/)

rg syncCursor --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -t tsx -c
rg syncSelected --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -t tsx -c
rg prevDescendantCardId --glob '!.beads' --glob '!vendor' -t ts -t tsx -c
rg expandWithDescendants --glob '!.beads' --glob '!vendor' -t ts -t tsx -c
rg hydrateDescendantSelection --glob '!.beads' --glob '!vendor' -t ts -t tsx -c
\`\`\`

### Phase 5 gates (editing + visual ad-hoc → 0)

\`\`\`bash
rg syncEdit --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -t tsx -c
rg expandedEditCardId --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -t tsx -c
rg cursorInDescendant --glob '!.beads' --glob '!vendor' --glob '!docs' -t ts -t tsx -c
\`\`\`

### Behavioral gates

- [ ] Golden tests from Phase 0 still pass (no visual precedence drift)
- [ ] cursor-perf bench: content render ≤ 8% of wall time
- [ ] All reduced signals use counts internally (not booleans)
- [ ] Memory: no signal leaks on node remove (cleanup verified in test)
- [ ] cursorDescendant works at ALL node levels (not just cards)
- [ ] Deselected state (cursor=null) → all signals false (no crash)

### Docs gates (sweep after Phase 5)

\`\`\`bash

## Docs must also be updated — not just code

rg syncCursor docs/ -c   # update references
rg cursorInDescendant docs/ -c   # update references
rg expandedEditCardId docs/ -c   # update references
\`\`\`

## Test impact

| Category | Files                                                 | Action                                                         |
| -------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| REWRITE  | board-test.ts, storybook.tsx                          | Core helpers → batch()                                         |
| GOLDEN   | cursor-colors, board-selection, column-rendering      | Run before, verify after                                       |
| KEEP     | 20+ slow.spec.ts, cursor-signals, tree-concerns       | Must still pass                                                |
| ADAPT    | inline-edit, board-edit, detail-pane, edit-save-repro | May reference expandedEditCardId                               |
| ADD      | 5 new golden tests                                    | cursor-descendant all levels, edit expand, sigils, batch, sync |

## What stays vs what goes

**KEEP** (theme utilities, not state): selectedBg, multiSelectedBg, colorOverride mechanism
**KEEP** (layout, not state): deriveCursorIndices, ReactiveNodeStore class (evolves), useNodeStore hook
**REMOVE**: syncCursor, syncSelected, syncEdit, expandWithDescendants, hydrateDescendantSelection, prevDescendantCardId
**REPLACE**: cursorInDescendant → cursorDescendant, expandedEditCardId → editingDescendant, NodeReactiveState interface
**ADAPT**: isColumnSelected, isBoardSelected, isCursorOnCard, shouldStripColor, boardBg/columnBg/cardBg (derive from new signals)

