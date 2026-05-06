---
mentions:
  - km
  - test-infra
id: "@km/tui/test-accuracy/unify"
aliases:
  - km-tui.test-accuracy.unify
  - km-tui-test-accuracy-unify
created_by: claude:b329c279
created_at: 2026-02-16T10:21:18Z
closed_at: 2026-02-18T08:19:57Z
owner: bjorn@stabell.org
assignee: test-infra
---

# [x] Unify testEnv and createApp rendering pipeline @km/tui #task #P1 @test-infra

testEnv uses a 5-iteration layout stabilization loop while production renders in a single pass. This means tests over-stabilize, masking bugs that appear in production. Additionally scroll state updates differ. Fix: make testEnv match production's single-pass behavior, or if production needs the loop, add it there too.

