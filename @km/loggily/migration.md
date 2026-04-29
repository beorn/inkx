---
id: "@km/loggily/migration"
aliases:
  - km-loggily.migration
  - km-loggily-migration
created_by: Bjørn Stabell
created_at: 2026-04-12T06:58:31Z
closed_at: 2026-04-12T18:19:57Z
close_reason: "v1→v2 migration guide written at docs/guide/migration-v2.md.
  Covers: global setters→config arrays, file writers→{ file }, custom
  writers→stages, .logger()→.child(), env vars, branches. Added to VitePress
  sidebar."
---

# [x] v1→v2 migration guide + km monorepo migration @km/loggily #task #P2

blocks:: [[@km/loggily/api-v2]], [[@km/loggily/v2-phase2]]

Migration guide for loggily v1→v2. ~88 files use createLogger (no change needed). ~10 files use globals (setLogLevel, addWriter, enableSpans) that need migrating to config objects. 2 files use loggily/worker (adapt to withWorker plugin). 1 file re-exports from @km/_orphan/core (update). Write guide + execute migration across km monorepo.