---
id: "@km/silvercode/queue-ux-tdd"
aliases:
  - km-silvercode.queue-ux-tdd
  - km-silvercode-queue-ux-tdd
created_by: claude:2405c72e
created_at: 2026-04-26T04:54:46Z
closed_at: 2026-04-26T06:38:16Z
close_reason: "Shipped: 55ff8d132 (A1 single cursor) + 09413424d (A2 per-line >
  prefix) + 07d9bd66d (A3 plain Enter inserts newline). 6 termless tests pass.
  Session: km-session.0425-evening"
started_at: 2026-04-26T04:55:27Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.queue-ux-tdd
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T21:55:08Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Queue UX bugs: two cursors + display formatting + force-flush trigger @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

TDD-first fix for three queue bugs in apps/silvercode/src/components/CommandBox.tsx. (A1) Double cursor visible while editing queue. (A2) Queue should show per-line > prefix with single-newline separation between entries (wire format keeps \n\n). (A3) Plain Enter in queue should not force-flush — should insert newline. Each bug needs a failing test before fix. Parent: @km/silvercode.