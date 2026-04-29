---
id: "@km/tui/focused-card-overflow"
aliases:
  - km-tui.focused-card-overflow
  - km-tui-focused-card-overflow
created_by: claude:da9990c5
created_at: 2026-04-28T19:01:08Z
closed_at: 2026-04-28T19:01:08Z
close_reason: Fixed in this session — columnHeight-aware expandedRowBudget in
  CardColumn.tsx + matching maxExpandedChildren in TreeNode.tsx. Failing test
  card-rendering.slow.test.ts:246 now passes.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.focused-card-overflow
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-28T12:01:08Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] Focused card overflow: bottom border + +N more clipped when cursor inside @km/tui #bug #P1

blocks:: [[@km/tui]]

FIXED in commit (this session). Symptom: focused card with many children loses bottom border + ╰─ +N more ─╯ row because the column overflow=hidden silently clips the card's last render row. isExpanded=cursorInDescendant bumped child cap from 3 to MAX_EXPANDED_CHILDREN=20 without checking if the card fits in the column allocation.

Fix in apps/@km/tui/src/views/CardColumn.tsx:
- Card accepts columnHeight prop
- expandedRowBudget = max(1, floor(columnHeight/2) - 3) for constrained columns (≤26 rows)
- baseMax = min(MAX_EXPANDED_CHILDREN, expandedRowBudget) when expanded
- React.memo comparator includes columnHeight

Mirror in TreeNode.tsx: maxExpandedChildren prop + memo comparator.

Test: apps/@km/tui/tests/card-rendering.slow.test.ts:246 'card border: overflow indicator > focused card with many children still shows bottom border + overflow indicator' — was failing pre-fix, passes now. Title-row regex bug (private-use icon U+F0F6 not matched by \s) also fixed.

Verified: 60 slow + 2534 default tests pass.

Follow-up: @km/silvery/column-resize-incremental-mismatch (P2 bug) — strict-mode regression on column-height resize, pipeline territory.