---
id: "@km/storage/remove-skipfssync"
aliases:
  - km-storage.remove-skipfssync
  - km-storage-remove-skipfssync
created_by: Bjørn Stabell
created_at: 2026-04-02T22:35:10Z
owner: bjorn@stabell.org
---

# [ ] Remove skipFsSync option — redundant with commit/project split @km/storage #task #P3

From Pro review + /big: skipFsSync was added before commit/project split existed. Now that reconciliation uses commit() directly (no project()), skipFsSync is never needed. wrapEmitterForReconcile already calls commit() not emit().

FIX: Remove skipFsSync from EmitOptions. Remove the guard in emit(). Clean up wrapEmitterForReconcile to be a simple commit-only wrapper.