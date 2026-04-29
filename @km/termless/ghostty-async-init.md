---
id: "@km/termless/ghostty-async-init"
aliases:
  - km-termless.ghostty-async-init
  - km-termless-ghostty-async-init
created_by: claude:f8196c1c
created_at: 2026-03-18T19:00:26Z
closed_at: 2026-03-19T16:54:50Z
close_reason: "Fixed: backend.ts header docs clarified async init contract,
  improved error message, added _resetSharedForTesting(). Test: backend.test.ts
  — init guard, re-init cleanup, destroy lifecycle (3 new tests). Verified: 555
  termless tests pass."
---

# [x] Async Ghostty init doesn't fit sync backend interface @km/termless #bug #P2 @claude:21c57d63

Deferred P2 from pro-review-2 (2026-03-13). Ghostty backend initialization is async but the TerminalBackend interface is sync. Creates a timing gap where backend is used before fully initialized. Found during GPT 5.4 Pro review of termless.