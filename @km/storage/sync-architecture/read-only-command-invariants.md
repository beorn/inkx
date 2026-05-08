---
aliases:
  - km-storage.sync-architecture.read-only-command-invariants
  - km-storage-sync-architecture-read-only-command-invariants
created_at: 2026-05-08T20:45:34.315Z
---

# Storage read-only commands never write source files @km/storage #bug @agent/3 #P0

Regression class exposed by km bd query @agent/3: a read-style command must not rewrite unrelated markdown through rule materialization or fs-writer side effects. Acceptance: CLI tests snapshot source-file hashes/mtimes before and after km query, km bd query, km bd list, km bd ready, and km bd show; read-only loads cannot register or trigger filesystem writeback; km bd query @agent/3 leaves git status unchanged except existing unrelated WIP; failing test proves any source-file write is caught.
