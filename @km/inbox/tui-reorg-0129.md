---
mentions:
  - km
  - claude
id: "@km/inbox/tui-reorg-0129"
aliases:
  - km-tui-reorg-0129
  - "@km/_orphan/tui-reorg-0129"
created_at: 2026-01-29T18:20:44Z
closed_at: 2026-01-29T18:33:12Z
assignee: claude:298008b9
---

# [x] Reorganize km-tui src/ into board/, keyboard/, handlers/ subdirectories @km/_orphan #task #P1 @claude:298008b9

apps/@km/tui/src/ has 28 files at root level. Analysis recommends:

Move to board/:

- board-actions.ts (dispatcher)
- board-actions-edit.ts
- board-actions-nav.ts
- board-actions-selection.ts
- board-actions-zoom.ts

Move to keyboard/:

- keyboard-types.ts
- keyboard-helpers.ts
- keyboard-card-ops.ts

Move to handlers/:

- navigation-handlers.ts
- mouse-handler.ts
- paste-handler.ts

Impact: 11 files moved, ~15 import updates, low risk
Execution: ~30-45 minutes

