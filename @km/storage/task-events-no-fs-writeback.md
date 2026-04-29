---
id: "@km/storage/task-events-no-fs-writeback"
aliases:
  - km-storage.task-events-no-fs-writeback
  - km-storage-task-events-no-fs-writeback
created_by: Bjørn Stabell
created_at: 2026-03-31T21:31:45Z
closed_at: 2026-03-31T21:44:19Z
close_reason: "Fixed: task_claimed/released/completed events now trigger file
  regeneration in both SyncManager and FsWriter."
---

# [x] P1: task_claimed/released/completed never reach filesystem @km/storage #bug #P1

task_claimed, task_released, task_completed events update DB but the fs writers only handle node_updated/created/deleted/moved. Markdown stays stale after these events. Fix: normalize to node_updated before emission, or teach fs writers to handle task events.