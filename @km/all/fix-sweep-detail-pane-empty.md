---
id: "@km/all/fix-sweep-detail-pane-empty"
aliases:
  - km-all.fix-sweep-detail-pane-empty
  - km-all-fix-sweep-detail-pane-empty
created_by: claude:cc081a9a
created_at: 2026-04-26T21:46:46Z
closed_at: 2026-04-26T21:56:32Z
close_reason: "fixed: test premise was wrong — Ctrl+l (add_link) closes detail
  pane via openOmniboxForVerb→closeDetailPane(board-actions.ts:569). Removed the
  bogus render-flush keypress; React reactivity propagates sel.deselect()
  naturally and the detail pane stays open with 'DETAIL VIEW' header. Full
  detail-pane.slow.test.ts suite: 85/85 pass."
started_at: 2026-04-26T21:47:48Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-detail-pane-empty
    depends_on_id: km-all.fix-sweep-remaining-slow
    type: parent-child
    created_at: 2026-04-26T14:46:46Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Detail pane empty state fallback missing DETAIL VIEW header @km/all #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-remaining-slow]]

apps/@km/tui/tests/detail-pane.slow.test.ts:732 'detail pane shows header bar in fallback state' fails.

Expected: screenshot contains 'DETAIL VIEW' label.
Actual: screenshot shows the help/keybindings dialog instead — DetailPane fallback is routing to the wrong content.

Likely bug:
- DetailPane fallback render path is broken — shows help dialog when no node selected
- OR: fallback rendering doesn't include the 'DETAIL VIEW' header bar at all (regression)

Investigate:
- apps/@km/tui/src/views/DetailPane*.tsx — fallback / empty state rendering
- Recent git history for fallback rendering changes

Fix at the lowest correct layer. Add regression coverage.