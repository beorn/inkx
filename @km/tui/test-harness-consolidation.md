---
mentions:
  - km
  - claude
id: "@km/tui/test-harness-consolidation"
aliases:
  - km-tui.test-harness-consolidation
  - km-tui-test-harness-consolidation
created_by: claude:c6244087
created_at: 2026-04-23T17:27:25Z
closed_at: 2026-04-23T17:48:12Z
close_reason: Agent B shipped unified createTestApp() entry at
  apps/km-tui/tests/helpers/create-test-app.ts + 12-test createRenderer defaults
  contract suite at
  vendor/silvery/tests/contracts/create-renderer-defaults.contract.test.tsx.
  km-tui 1824 tests pass. Silvery 9912d7df + km e2ac4ae54 + 1f4676652.
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-tui.test-harness-consolidation
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-23T10:27:24Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] km-tui test harness: consolidate 3 overlapping helpers into 1 @km/tui #task #P2 @claude:c6244087

blocks:: [[@km/tui]]

Per /big test-harness audit 2026-04-23 (NEAR-PLATEAU verdict). apps/@km/tui/tests/helpers/ has 3 overlapping wrappers (board-test.ts, test-app.ts, real-board.ts) that each reinvent fixture builders, store context, focus manager. Consolidate into a single createTestApp() factory with internal backend selection. Also: add createRenderer-defaults.contract.test.tsx mirroring the existing create-termless-defaults contract tests.

