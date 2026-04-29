---
id: "@km/silvercode/event-log-rotation"
aliases:
  - km-silvercode.event-log-rotation
  - km-silvercode-event-log-rotation
created_by: claude:0940ca20
created_at: 2026-04-24T15:39:59Z
closed_at: 2026-04-24T15:50:04Z
close_reason: "Shipped in 1c59bceff: 10 MiB cap, 3-generation rotation, size()
  observer. 7 tests cover basic append/legacy
  signature/rotation/trim/multi-rotation preservation/memory backend unchanged."
---

# [x] event-log: rotate + cap per-session JSONL size @km/silvercode #task #P3 @claude:0940ca20

blocks:: [[@km/silvercode]]

Currently event-log.ts appends unboundedly to <logDir>/<sessionId>.jsonl. Long sessions accumulate MBs of JSONL. Add rotation: cap each file at 10MB, rotate to .jsonl.1 / .jsonl.2 keeping last 3 generations. Or simpler: truncate on append when size > cap, preserving tail. Also add a size field to EventLog for observability. Apps/silvercode/packages/agent-harness/src/event-log.ts.