---
id: "@km/tui/column-primitive"
aliases:
  - km-tui.column-primitive
  - km-tui-column-primitive
created_by: claude:8b5b9e1c
created_at: 2026-04-21T03:59:20Z
closed_at: 2026-04-21T04:18:22Z
close_reason: >-
  Unified CardColumn gap contract behind a Column primitive.


  **Commits:**

  - 6761425a8 test(km-tui): parity tests for CardColumn structural+body
  rendering

  - 227392ef8 refactor(km-tui): unify CardColumn gap contract behind Column
  primitive


  **What landed:**


  1. Parity tests first (apps/km-tui/tests/column-primitive.slow.test.tsx, 11
  tests) — characterise the gap contract between every sibling-pair of frame
  types (bordered↔naked). Pass on HEAD; continue to pass after refactor.


  2. Column primitive extracted in-place in CardColumn.tsx:
     - `CardFrame = 'bordered' | 'naked' | 'hr'` — single classification
     - `classifyFrame(card, isBody)` — one source of truth for frame type
     - `computeLeadingGap(prev, next): number` — pure rule, single source of truth for inter-item spacing
     - Rule: 1-row gap ONLY when next=naked AND prev!=naked. Otherwise 0.

  3. Card API change: `isPrevBodyBlock: boolean` → `leadingGap: number`. The
  Card applies the gap blindly as paddingTop; it no longer reasons about its
  siblings. The rule is computed once, at the Column level in renderItem.


  4. Gap applied as paddingTop INSIDE the card's outer Box (not as a
  column-level sibling spacer) — preserves selection-bg continuity across the
  gap row when the card is cursor/multi-selected. Covered by a new 'selection
  tint continuity' test.


  **Intentionally NOT unified — two overflow policies:**


  Bordered cards count hidden CHILDREN and render them in a custom `╰─ +N more
  ─╯` bottom border. Naked body blocks count hidden ROWS via TreeNode's maxRows
  contract and render a `···` indicator inside content. These measure
  semantically different things; collapsing them would lose one of the two
  behaviours. Both are supported; the choice is a property of the card's frame.
  Documented in a JSDoc block at the top of the Column primitive section.


  **Verification:**


  - apps/km-tui/tests/column-primitive.slow.test.tsx — 11 parity tests pass

  - apps/km-tui/tests/body-block-spacing.slow.test.tsx — 4/4 pass (the original
  bug it guards against)

  - apps/km-tui/tests/body-card-truncation.slow.test.tsx — 4/4 pass

  - apps/km-tui/tests/showcase.spec.ts — 15/15 pass, snapshot unchanged

  - apps/km-tui/tests/board-render.test.ts + column-rendering.test.ts +
  scroll-and-cursor.test.tsx — 70/70 pass

  - apps/km-tui/tests/column-top-disappears-realvault.slow.test.tsx — 2/2 pass
  (real-vault end-to-end)

  - bunx tsc --noEmit — 0 errors in km-tui

  - Real-vault capture at 240×117 on ~/Bear/Vault:
  /tmp/km-tui-column-primitive-post-refactor.txt — shows gap contract working
  correctly across @agent / @next / @inbox columns with mixed bordered+naked
  content.


  **NOT fixed (pre-existing HEAD failures, unrelated to this bead):**


  - card-rendering.slow.test.ts: 11 failing tests about 'body cards have dim
  border' (stale tests from an older architecture where body cards were
  bordered) + 'date badge right-border' + 'emoji wide-char garble'. All
  pre-existing on HEAD; same count post-refactor.


  **Why this is 'the real unification' given the risk boundaries:**


  The bead's risk-management section warned: 'If overflow count semantics differ
  between the two branches in ways that can't unify under one contract ...
  document the difference in the Column primitive's JSDoc and support BOTH as
  configurable policies. Unification-that-hides-semantic-differences is worse
  than no unification.'


  The two overflow policies count different things (children vs. rows). Forcing
  them under a single maxRows contract would lose the 'hidden children' semantic
  on bordered cards. So the unification is in list-rendering mechanics — one
  frame enum, one gap rule, one prop — while the per-frame overflow policies
  remain documented and deliberately distinct.
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-tui.column-primitive
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-20T20:59:20Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Unify CardColumn structural + body render branches into Column primitive @km/tui #feature #P3 @claude:8b5b9e1c

blocks:: [[@km/tui]]

CardColumn has two parallel render branches: structural cards (bordered, overflow count in border) vs body blocks (unframed, maxRows + indicator). Body-block-leading-gap was fixed by 1-line paddingTop guard — dual-branch had different spacing contracts. Real plateau: unify behind single Column primitive with frame?: 'bordered' | 'naked' + uniform gap. Requires visual parity tests before+after.