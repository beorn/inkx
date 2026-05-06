---
mentions:
  - km
  - claude
id: "@km/inbox/inkx-batch"
aliases:
  - km-inkx-batch
  - "@km/_orphan/inkx-batch"
created_at: 2026-02-01T23:18:59Z
closed_at: 2026-02-01T23:29:23Z
assignee: claude:5fa2decc
---

# [x] inkx-loop: Add render batching to run() @km/_orphan #task #P1 @claude:5fa2decc

The new run() re-renders on every event, while the old render() has a RenderScheduler that coalesces multiple state changes into single renders.

For rapid updates (typing, scrolling), this could cause performance issues.

Add batching similar to RenderScheduler.scheduleRender() which coalesces multiple calls within the same synchronous execution.

Parent: @km/_orphan/silvery-legacy-loop

