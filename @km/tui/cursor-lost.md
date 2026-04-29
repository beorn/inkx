---
id: "@km/tui/cursor-lost"
aliases:
  - km-tui.cursor-lost
  - km-tui-cursor-lost
created_by: claude:f8196c1c
created_at: 2026-03-28T00:41:10Z
closed_at: 2026-03-28T01:38:47Z
close_reason: "Fixed: resolvePersistedPane now computes initial cursor for
  restored boards instead of null. Cursor stores synced after workspace
  restoration."
---

# [x] Cursor lost on board resume — 'no cursor' state should be an invariant violation @km/tui #bug #P1 @claude:f8196c1c

When resuming km view on a board (e.g., @next), the cursor is lost — shows 'no cursor' and navigation is impossible. This has been a recurring issue.

Repro:
1. km view in vault, navigate to @next board
2. Exit km view
3. km view again — lands on @next but cursor is gone

Root cause hypothesis: cursor state is persisted (remembers last board) but the cursor node ID doesn't resolve after re-opening — the node may have moved, been deleted, or the board's children changed.

Proposed fix — treat as invariant:
- A board with visible cards MUST have a valid cursor. If cursorNodeId doesn't resolve to a visible node, immediately recover:
  1. Try first visible card in the first column
  2. If no cards, set cursor to column header
  3. If no columns, that's a legitimate empty state
- Add an invariant check: if cursor is null/unresolvable AND board has visible items, throw/warn and auto-recover
- Add tests: cursor recovery after node deletion, after board change, after embed target removal
- Consider: should cursor state be validated on every render cycle, or just on board mount?