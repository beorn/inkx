---
id: "@km/all/fix-sweep-remaining-slow"
aliases:
  - km-all.fix-sweep-remaining-slow
  - km-all-fix-sweep-remaining-slow
created_by: claude:cc081a9a
created_at: 2026-04-26T21:39:12Z
closed_at: 2026-04-26T22:09:39Z
close_reason: Closed
started_at: 2026-04-26T21:40:11Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-remaining-slow
    depends_on_id: km-all.fix-sweep-0426
    type: parent-child
    created_at: 2026-04-26T14:39:29Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Remaining 6 km-tui slow test failures — heterogeneous real bugs @km/all #bug #P1 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

After fix-sweep waves 1-3, 6 untracked @km/tui slow test failures remain. Each is a real bug (per memory: fix the core, never the test).

## Failing tests
1. apps/@km/tui/tests/scroll.slow.test.ts:91 — asymmetric horizontal scroll: viewport doesn't scroll back left after press(l,l,h)
2. apps/@km/tui/tests/scroll.slow.test.ts:572 — column shift with collapsed columns: collapsed col not visible after shift
3. apps/@km/tui/tests/inline-edit.slow.spec.ts:2238 — edit indentation parity: edit indent 6 vs display indent 2 (delta 4 > 2)
4. apps/@km/tui/tests/board-features.slow.spec.ts:147 — truncation ellipsis missing for 200-char title (sees ⋯⋯ centerEllipsis but expected Unicode … U+2026)
5. apps/@km/tui/tests/board-features.slow.spec.ts:567 — search scrolling renders 23 matches when ≤15 expected (duplicate rendering)
6. apps/@km/tui/tests/detail-pane.slow.test.ts:732 — detail pane empty state missing DETAIL VIEW header label

## Already tracked (separate beads)
- wide-char emoji garble → @km/silvery/wide-char-incr-render
- td chord Escape → @km/_orphan/otm6c

## Standard
Per feedback-fix-core-bugs-not-tests.md: fix the core, never the test. NEVER disable inputs, relax thresholds, .skip, bump retries. Pipeline/layout/state-machine bugs are top priority. If a test premise is genuinely wrong (rare), update the test AND verify the new contract is intentional.

## Acceptance
- 4 of 6 fixed at the lowest correct layer (or all 6 if root causes are tractable)
- Remaining failures tracked as separate P1/P2 beads with root cause identified
- New regression tests for any pipeline/layout fixes