---
id: "@km/silvery/era2b-6-model"
aliases:
  - km-silvery.era2b-6-model
  - km-silvery-era2b-6-model
created_by: claude:f8196c1c
created_at: 2026-03-20T20:06:37Z
closed_at: 2026-03-25T07:34:20Z
close_reason: "@silvery/model package created: defineModel, createModelRegistry
  (register, get, has, deps). 5 tests passing."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2b Phase 6: @silvery/model — optional DI factories @km/silvery #task #P2 @claude:fed8de9e

New optional package. createModel() with explicit DI, typed hooks. Depends on @silvery/signals. Optional — users can skip this and use signals directly or any other state system.