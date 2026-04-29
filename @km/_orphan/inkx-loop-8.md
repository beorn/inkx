---
id: "@km/_orphan/inkx-loop-8"
aliases:
  - km-inkx-loop-8
created_at: 2026-02-01T23:07:26Z
closed_at: 2026-02-01T23:16:00Z
assignee: claude:5fa2decc
---

# [x] inkx-loop Step 8: Migration path @km/_orphan #task #P2 @claude:5fa2decc

Create migration path from old inkx APIs to inkx-loop.

Parent: @km/_orphan/silvery-legacy-loop

- Ship under 'inkx/next' import first
- Mark legacy APIs deprecated but keep as thin wrappers
- Write codemods for common patterns
- Major bump to remove wrappers