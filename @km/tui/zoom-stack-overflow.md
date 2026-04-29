---
id: "@km/tui/zoom-stack-overflow"
aliases:
  - km-tui.zoom-stack-overflow
  - km-tui-zoom-stack-overflow
created_by: Bjørn Stabell
created_at: 2026-04-13T21:13:57Z
closed_at: 2026-04-21T04:38:06Z
close_reason: "Fixed via e31e81210 — converted collectDescendantsInto() in
  apps/km-tui/src/state/reactive.ts from recursive to iterative DFS with
  visited-set cycle guard. The only recursive function in the zoom-out path is
  now stack-bounded only by memory. Regression guards: 4 tests in
  apps/km-tui/tests/zoom-stack-overflow.slow.test.ts (2 unit tests directly
  verify cycle + deep-chain resilience; 2 scenario tests cover full production
  wiring). Could not reliably reproduce the original RangeError in unit or
  mcp__tty harnesses — if it recurs with a different trigger, capture stack
  trace and extend tests. Verification: npx tsc --noEmit → 0 errors
  (non-vendor); bun vitest run --project=slow
  apps/km-tui/tests/zoom-stack-overflow.slow.test.ts → 4/4 passing."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-tui.zoom-stack-overflow
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-13T14:14:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Stack overflow on zoom out after file rename @km/tui #bug #P2 @claude:8b5b9e1c

blocks:: [[@km/tui]]

Zooming out from a +km.md file that was being renamed causes: RangeError: Maximum call stack size exceeded. The error occurs in the silvery event loop, not in the zoom handler itself. Likely a reactive signal cycle triggered by the tree update during rename + zoom. KTree.nodes uses iterative DFS (no stack overflow risk), so the cycle is in the render/signal path. Needs reproduction with the exact vault state.