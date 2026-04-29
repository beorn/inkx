---
id: "@km/silvery/examples-tests"
aliases:
  - km-silvery.examples-tests
  - km-silvery-examples-tests
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:31Z
closed_at: 2026-04-27T04:26:52Z
close_reason: "Bug 3 (Tab→submit) fixed: silvery 2d4a8583 + km 6bc1cce55.
  Remaining 2 failures are real pipeline/layout bugs split out to:
  km-silvery.ai-chat-incremental-mismatch (render #20 bg mismatch) +
  km-silvery.listview-resize-scroll-target (scrollTo viewport drift on resize)."
started_at: 2026-04-26T23:24:14Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.examples-tests
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:36Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] vendor/silvery examples — 3 failures (2 files) @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

ai-chat.test.tsx (2: lines 110, 153), aichat-inline-bugs.test.tsx (1: line 328). /complete: bun vitest run --project vendor vendor/silvery/tests/examples/ai-chat.test.tsx vendor/silvery/tests/examples/aichat-inline-bugs.test.tsx → 0 failures.