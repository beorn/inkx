---
id: "@km/silvery/ai-chat-incremental-mismatch"
aliases:
  - km-silvery.ai-chat-incremental-mismatch
  - km-silvery-ai-chat-incremental-mismatch
created_by: claude:cc081a9a
created_at: 2026-04-27T04:26:18Z
closed_at: 2026-04-27T05:08:16Z
close_reason: "silvery 168b4989 (clearExcessArea hasPrevBuffer guard) + km
  05c671feb. Same root cause: clearExcessArea was firing for absolute-positioned
  children even when parent's absoluteChildMutated cascade had already
  re-rendered siblings. Fix: gate on hasPrevBuffer. ai-chat 5/5 pass, fuzz 21/21
  files / 722/722 tests pass."
started_at: 2026-04-27T04:27:39Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.ai-chat-incremental-mismatch
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T21:26:51Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] ai-chat.test.tsx:110 — IncrementalRenderMismatchError on render #20 (bg null vs object) @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

Real pipeline bug. ai-chat.test.tsx:110 ('Enter 1') trips SILVERY_STRICT (createApp): MISMATCH at (118, 36) on render #20. Both incremental and fresh produce char=' ' but bg differs (null vs [object Object]). Looks like a stale-pixel bug in the cloned buffer at the right edge of a row that lost its scrollbar █ between frames as content grew. Dump: /var/folders/x6/0j792q0d0411wgsxyr1bqkp40000gn/T/silvery-strict-failure-1777260617031.txt. Split out from @km/silvery/examples-tests by silvery-examples-5 agent (2026-04-26). /complete: bun vitest run --project vendor vendor/silvery/tests/examples/ai-chat.test.tsx → all pass.