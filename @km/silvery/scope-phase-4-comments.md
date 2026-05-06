---
mentions:
  - km
id: "@km/silvery/scope-phase-4-comments"
aliases:
  - km-silvery.scope-phase-4-comments
  - km-silvery-scope-phase-4-comments
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:40:49Z
closed_at: 2026-04-24T23:31:32Z
close_reason: "No app-layer or test-fixture migrations needed. Grep results
  2026-04-24: apps/km-tui/tests/ + vendor/silvery/tests/ have zero mentions of
  useDispose/process.on(SIG); apps/silvercode/src/test/fake-session.ts has 2
  doc-comment mentions but they describe what the helper is testing (controller
  close() behavior), not stale code; apps/silvercode/src/App.tsx uses
  useDispose/useExit actively but is gated (silvercode actively churning,
  deferred per Phase 1.4 policy). Phase 4 epic effectively closed once
  silvercode migration lands."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.scope-phase-4-comments
    depends_on_id: km-silvery.scope-phase-4
    type: parent-child
    created_at: 2026-04-24T13:40:49Z
    created_by: claude:2aefb4b6
    metadata: "{}"
  - issue_id: km-silvery.scope-phase-4-comments
    depends_on_id: km-silvery.scope-phase-4-eslint
    type: blocks
    created_at: 2026-04-24T13:40:49Z
    created_by: claude:2aefb4b6
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.scope-phase-4
      - type: link
        target: km-silvery.scope-phase-4-eslint
---

# [x] Phase 4.G: Inline comments + test fixtures @km/silvery #task #P2

blocks:: [[@km/silvery/scope-phase-4]], [[@km/silvery/scope-phase-4-eslint]]

Grep useDispose|term.signals.on|useExit in app-layer inline comments; update or delete obsolete comments explaining the old pattern. Sweep apps/@km/tui/tests/** + vendor/silvery/tests/** for test-level resource setup showing old idiom. Exit: grep clean in non-vendor inline comments + tests use the new pattern.

