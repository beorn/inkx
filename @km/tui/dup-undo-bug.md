---
id: "@km/tui/dup-undo-bug"
aliases:
  - km-tui.dup-undo-bug
  - km-tui-dup-undo-bug
created_by: claude:499eee95
created_at: 2026-02-13T18:27:46Z
closed_at: 2026-02-13T18:45:27Z
---

# [x] Duplicate undo returns wrong children count @km/tui #bug #P2

explore-duplicate-undo-focus.test.ts:11 fails:
BUG: Duplicate undo didn't work. Children after undo: ["A","A","B"]. Expected 2 children, got 3.

Duplicate creates an undo entry but undoing doesn't remove the duplicated node.