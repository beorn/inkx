---
mentions:
  - km
  - test-infra
id: "@km/tui/test-accuracy/invariants"
aliases:
  - km-tui.test-accuracy.invariants
  - km-tui-test-accuracy-invariants
created_by: claude:b329c279
created_at: 2026-02-16T10:21:25Z
closed_at: 2026-02-18T08:22:54Z
owner: bjorn@stabell.org
assignee: test-infra
---

# [x] Visual invariant assertion system @km/tui #task #P1 @test-infra

Build composable visual assertions that encode user vocabulary: expectBorderContinuous, expectTextTruncated, expectNoGhostChars, expectBlankRegion, expectIncrementalMatchesFresh, expectCursorVisible, etc. Every visual descriptor a user uses should have a corresponding test helper.

