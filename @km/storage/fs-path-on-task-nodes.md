---
mentions:
  - km
id: "@km/storage/fs-path-on-task-nodes"
aliases:
  - km-storage.fs-path-on-task-nodes
  - km-storage-fs-path-on-task-nodes
created_by: claude:adeac868
created_at: 2026-04-25T05:59:59Z
closed_at: 2026-04-25T06:02:15Z
close_reason: Reverted — keeping all content/data-model issues consolidated on
  km-storage.content-issues for now (per Bjørn 2026-04-25). Spin-outs were
  premature; one running list is the chosen model.
owner: bjorn@stabell.org
---

# [x] Task nodes carry fs_path=NULL — schema asymmetry forces recursive walks @km/storage #chore #P3

Spun out from @km/storage/content-issues (vault session, 2026-04-24).

Task nodes carry fs_path = NULL; only file/heading nodes have it. Filtering tasks by directory in SQL requires a recursive parent_id walk to the nearest .md ancestor. Asymmetric and surprising — every consumer of the tasks table has to reimplement the walk or get wrong answers.

## Design question

Denormalize fs_path (or repo_path) onto every node at write time so queries can filter directly without walks?

