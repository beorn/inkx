---
mentions:
  - km
  - test-infra
id: "@km/tui/test-accuracy"
aliases:
  - km-tui.test-accuracy
  - km-tui-test-accuracy
created_by: claude:b329c279
created_at: 2026-02-16T10:21:10Z
closed_at: 2026-02-18T08:23:01Z
owner: bjorn@stabell.org
assignee: test-infra
---

# [x] TUI test accuracy: unify testEnv/createApp + visual invariants @km/tui #feature #P1 @test-infra

Make TUI tests exercise the same rendering pipeline as production, and build visual invariant helpers that encode user vocabulary as assertions. Goal: user <=> AI TUI tests works ~100% of the time, eliminating dependency on GUI/TTY verification for bug closure.

Two work streams:

1. Unify testEnv/createApp rendering — testEnv has 5-iteration layout stabilization loop, production does single pass. This divergence caused 5/9 bugs in session 0215b to be prematurely closed.
2. Visual invariant system — every visual descriptor users use (borders missing, text truncated, blank area, ghost chars, alignment) becomes a composable assertion.

This is foundational technology that enables faster iteration loops.

