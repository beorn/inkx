---
id: "@km/_orphan/m7my"
aliases:
  - km-m7my
created_at: 2026-01-20T22:07:02Z
closed_at: 2026-01-20T22:07:31Z
---

# [x] Add warning for unhandled actions in board reducer @km/_orphan #task #P1

The board reducer silently returns state on unknown action types (default: return state). This causes bugs to fail silently. Add debug logging or throw in dev mode for unhandled actions.