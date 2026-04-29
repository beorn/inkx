---
id: "@km/_orphan/nco09"
aliases:
  - km-nco09
created_by: Bjørn Stabell
created_at: 2026-04-01T06:10:39Z
closed_at: 2026-04-02T04:05:43Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] WriteQueue.flush() is re-entrant — can write stale content over newer content @km/_orphan #bug #P0 @Bjørn Stabell

Found by GPT 5.4 Pro review (2026-03-31).

File: packages/@km/storage/src/watch/writequeue.ts:476-604
Classification: P0

If flush A is delayed by retries/slow I/O, new writes can queue and flush B can run first. Flush B writes newer bytes, then flush A resumes and overwrites them with older bytes. The pending-map only coalesces before a batch is copied out; it does not protect across overlapping flushes.

Suggested fix: Add a flush mutex / single in-flight flush promise. Drain pending operations in a loop until empty. Also stamp ops with a per-path generation and drop stale generations before execution.