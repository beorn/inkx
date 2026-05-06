---
mentions:
  - km
id: "@km/inbox/wbpu"
aliases:
  - km-wbpu
  - "@km/_orphan/wbpu"
created_at: 2026-01-21T13:23:22Z
closed_at: 2026-01-21T13:26:34Z
---

# [x] Fix diffNodes to detect data field changes for sigil tag sync @km/_orphan #bug #P2

After km bd migrate, @issue tags on paragraph lines aren't indexed because diffNodes in reconcile.ts only compares content, task_status, task_mark - not the data field where mentions/tags/projects are stored. This prevents km view @issue from finding migrated issues.

