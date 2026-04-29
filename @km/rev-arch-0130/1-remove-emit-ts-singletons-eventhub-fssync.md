---
id: "@km/rev-arch-0130/1-remove-emit-ts-singletons-eventhub-fssync"
aliases:
  - km-rev-arch-0130.1
  - km-rev-arch-0130-1
  - "@km/rev-arch-0130/1"
created_at: 2026-01-30T00:35:27Z
closed_at: 2026-02-03T21:34:09Z
---

# [x] Remove emit.ts singletons (eventHub, fsSync) @km/rev-arch-0130 #bug #P2

Critical: `let eventHub` and `let fsSync` at module scope in packages/@km/storage/src/internal/emit.ts:27-30. Hidden global dependencies break test isolation. Migrate to Emitter domain object.