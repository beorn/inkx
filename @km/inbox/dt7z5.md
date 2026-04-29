---
id: "@km/_orphan/dt7z5"
aliases:
  - km-dt7z5
created_by: claude:c9beade3
created_at: 2026-03-13T23:20:40Z
closed_at: 2026-03-13T23:40:47Z
close_reason: Fixed assertScrollbackLines to use Math.max(0, totalLines -
  screenLines) instead of totalLines. Updated tests in both assertions.test.ts
  and viterm/matchers.test.ts.
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] termless: toHaveScrollbackLines compares totalLines not scrollback @km/_orphan #bug #P0 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

File: src/assertions.ts:338-356
Classification: P0

toHaveScrollbackLines(n) compares against totalLines which includes visible screen rows. The matcher is off by screenLines.

Suggested fix: Compare Math.max(0, totalLines - screenLines) instead, or rename if total buffer lines is the intent.