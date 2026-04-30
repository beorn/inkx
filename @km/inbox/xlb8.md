---
id: "@km/inbox/xlb8"
aliases:
  - km-xlb8
  - "@km/_orphan/xlb8"
created_at: 2026-01-19T23:02:43Z
closed_at: 2026-01-20T00:12:54Z
---

# [x] Extract shared TUI logic between ink and inkx engines @km/_orphan #task #P1

Both ink and inkx view implementations share significant business logic (state management, keyboard handling, commands). To avoid implementing features twice and reduce maintenance burden, extract shared logic into a common layer.

Candidates for extraction:
- Keyboard input handling and command dispatch
- State management (boardState, selection, navigation)
- Dialog logic (NewItemDialog, ProjectPicker)
- Tree node helpers (already shared: tree-node-helpers.ts)

The views themselves will still differ (ScrollableList constraint system vs native overflow:scroll), but business logic should be engine-agnostic.

## Blocking Question
What is the goal for the ink engine?
- Permanent fallback for environments where inkx has issues?
- Temporary comparison for performance benchmarking?
- Deprecation candidate once inkx is stable?

The answer affects whether we invest in shared logic extraction or just freeze ink at a functional baseline.

Related: @km/cmd/migrate (state model work), @km/tui1/1-decompose-board-tsx-2804-lines (Board.tsx decomposition)