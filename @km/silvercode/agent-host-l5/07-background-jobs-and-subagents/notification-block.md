---
mentions:
  - km
aliases:
  - "@km/silvercode/parity-claude/notification-indicators"
  - "@km/silvercode/notification-block"
  - "@km/silvercode/notification-indicators"
  - km-silvercode.notification-block
  - km-silvercode-notification-block
  - km-silvercode.notification-indicators
  - km-silvercode-notification-indicators
created_by: claude:2405c72e
created_at: 2026-04-28T19:36:38Z
owner: bjorn@stabell.org
closed_at: 2026-05-06T22:14:36Z
close_reason: "Shipped NotificationBlock in ChatPane composer overlay. Shows
  compact running counts for Task/Agent tool calls, Ctrl-B background tasks, and
  run_in_background Bash shells; click expands inline detail. Tests: bun vitest
  run apps/silvercode/tests/notification-block.test.tsx
  apps/silvercode/tests/content-layout.test.tsx."
dependencies:
  - issue_id: km-silvercode.notification-block
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:36:38Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
propsRaw: {}
---

# [x] Notification block for running agents, background tasks, and shells @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Long-running sub-agents (Task tool) and backgrounded turns (Ctrl+B) should be visible. Current state has side-panel rows, background task state, inline notification rows, and a notification block above the composer.

Add a `NotificationBlock` near the bottom chrome above the composer: N agents running · M bg tasks · K shells. Each chip is clickable to drill into the running work.

Files: `apps/silvercode/src/components/NotificationBlock.tsx`, `apps/silvercode/src/components/ChatPane.tsx`, `apps/silvercode/src/hooks/use-background-tasks.ts`.

Acceptance:

- `NotificationBlock` renders only when count > 0 (zero rows when idle)
- Click on chip opens the corresponding panel (background-tasks history, agents list, shells panel)
- termless test: 2 agents running + 1 bg task -> block shows `◇ 2 agents · ▣ 1 bg`

## Current State

2026-05-06:

- `controller.ts` owns background-task state and the notification stream.
- `SidePanel.tsx` shows agent/background/shell counts.
- `SessionUpdateList.tsx` interleaves notification rows by timestamp.
- `NotificationBlock` renders above the composer inside `ChatPane`, so expanded detail increases the bottom inset instead of covering transcript text.
- The block is hidden at zero counts and shows compact running counts such as `◇ 2 agents · ▣ 1 bg`.
- Clicking a chip opens inline detail. Background tasks reuse `BackgroundPane`; agent and shell chips list the running Task/Agent or Bash calls that produced the count.
- Verification: `bun vitest run apps/silvercode/tests/notification-block.test.tsx apps/silvercode/tests/content-layout.test.tsx` passed, 47 tests.
- Verification for existing legacy notification rows/stream: `bun vitest run apps/silvercode/tests/notification-event-row.test.tsx apps/silvercode/tests/notification-welcome-artifact.test.tsx apps/silvercode/tests/notification-stream.test.ts` passed as part of the 61-test run on 2026-05-06.

## Vocabulary Note

The UI vocabulary is `ChatPane` and `ChatBlock`; this shipped block is a `NotificationBlock`.

The notification ingestion subsystem now uses notification vocabulary in file names, stream types, entry kinds, and prompt-resource URIs.

