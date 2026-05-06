---
mentions:
  - km
id: "@km/tui/tree/v4/p7-char-tests"
aliases:
  - km-tui.tree.v4.p7-char-tests
  - km-tui-tree-v4-p7-char-tests
created_by: Bjørn Stabell
created_at: 2026-04-09T04:32:41Z
closed_at: 2026-04-09T04:55:37Z
close_reason: "22 characterization tests added across 5 files: cursor signals
  (3), board spec (5), fold persistence (3), signal propagation (7), undo
  interactions (4). Safety net for Phase 9. Commit 44dd10121."
owner: bjorn@stabell.org
---

# [x] Phase 7: Characterization tests — lock down Board/store behavior before rewrite @km/tui #task #P2

## What (from Pro review)

Before Phase 9 (Board.tsx rewrite), lock down current behavior with characterization tests. These protect the rewrite — any regression will be caught.

## Tests to add

1. Cursor invariants: editing node is valid, cursor fallback when node disappears
2. Selection normalization: multi-selection descendant expansion, deselect semantics
3. Fold/sticky persistence across hydrate/root change (zoom)
4. Collapse rule interaction (km.collapse:: true on root change)
5. Signal propagation: doneAncestor, selectedAncestor, cursorDescendant correctness
6. Delete/move/undo interactions with UI signals (cursor recovery, selection cleanup)

## Also covers (from @km/tui/quality-plateau/test-gaps)

- hidden.ts (226 LOC) — hidden node computation
- invariants.ts (347 LOC) — validation assertions
- undo-stack.ts (152 LOC) — undo/redo logic

## /complete

\`\`\`bash
bun vitest run apps/km-tui/tests/ --reporter=verbose 2>&1 | grep -c "✓"  # ≥5800 (from current 5757)

## At least 10 new characterization tests covering the 6 areas above

\`\`\`

