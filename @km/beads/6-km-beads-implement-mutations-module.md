---
mentions:
  - km
id: "@km/beads/6-km-beads-implement-mutations-module"
aliases:
  - km-beads.6
  - km-beads-6
  - "@km/beads/6"
created_at: 2026-01-21T10:47:53Z
closed_at: 2026-01-21T12:39:21Z
---

# [x] km-beads: Implement mutations module @km/beads #task #P2

Create packages/@km/beads/src/mutations.ts with:

- createIssue(title, options) - Create task with @issue tag, type/priority tags, short ID
- updateIssue(id, changes) - Update status, priority, assignee
- closeIssue(id, reason?) - Mark done, store close_reason in data

Create tests in packages/@km/beads/tests/mutations.test.ts

