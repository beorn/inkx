---
mentions:
  - km
id: "@km/storage/flow-docs"
aliases:
  - km-storage.flow-docs
  - km-storage-flow-docs
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:14Z
owner: bjorn@stabell.org
---

# [ ] Create FLOW.md — document both sync directions with exact file paths @km/storage #task #P3

From /big quality review: The core algorithm crosses 9 files (DB→FS) and 13 files (FS→DB). While README has ASCII diagrams, there's no single doc that traces every function call with exact file:line references.

Create packages/@km/storage/src/watch/FLOW.md with two sections: one for each direction, showing the exact call chain with file paths. This makes the architecture reviewable in one place.

